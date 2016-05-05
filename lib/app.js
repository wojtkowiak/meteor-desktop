var fs = require('fs');
var join = require('path').join;
var shell = require('shelljs');
var semver = require('semver');
var spawn = require('child_process').spawn;

function App($, runFromDist) {
    this.$ = $;
    this._runFromDist = runFromDist;
    this._log = require('./log')($, 'app');
}

App.prototype.bundle = function bundle(done) {
    this._log.info('bundling app');
    this.$.scaffold.prepare();
    this.$.waterfall([
        [this.ensureDeps, this],
        [this.bundleMeteor, this],
        [function doneCallback() {
            if (done) done();
        }, null]
    ]);
};

App.prototype.package = function packageMethod(options, done) {
    var self = this;
    this.bundle(function bundle() {
        self.$.electron.package(options, function doneCallback() {
            if (done) done();
        });
    });
};

App.prototype.run = function run(options, done) {
    var self = this;
    this.bundle(function bundle() {
        self.$.electron.package(options, function doneCallback() {
            if (self._runFromDist) {
                self._log.info('running from dist at ' + self.$.env.app.dist);
                shell.exec(self.$.env.app.distExe, { async: false });
            } else {
                if (!shell.which('electron')) {
                    console.error('No `electron` executable found. Run `npm install -g ' +
                        'electron-prebuilt`.');
                } else {
                    self._log.info('running from bundle at ' + self.$.env.app.root);
                    shell.cd(self.$.env.app.root);
                    shell.exec('electron .', { async: false });
                }
            }
            if (done) done();
        });
    });
};

App.prototype.bundleMeteor = function (/* server_url, */ done) {
    var appDir = this.$.env.app.bundled_app;
    var manifest;
    var injected;

    this._log.info('bundling meteor');

    if (!fs.existsSync(this.$.env.meteor_app.cordova_build)) {
        console.error('No cordova_build found at ' + this.$.env.meteor_app.cordova_build);
        process.exit(1);
    }

    // Bundle meteor.
    this._log.info('bundling to ' + appDir);

    shell.rm('-rf', appDir);
    this._log.info('cleared build dir');

    shell.cp('-R', this.$.env.meteor_app.cordova_build, appDir);

    // load manifest
    manifest = require(join(appDir, 'program.json')).manifest;
    injected = false;

    manifest.forEach(function eachAsset(file) {
        var fileContents;
        // Hacky way of setting isDesktop.
        if (file.type === 'js') {
            fileContents = fs.readFileSync(join(appDir, file.path), 'UTF-8');
            if (fileContents.indexOf('.isCordova=!0') ||
                fileContents.indexOf('.isCordova = true')) {
                injected = true;
            }
            fileContents = fileContents.replace('.isCordova=!0', '.isDesktop=!0');
            fileContents = fileContents.replace('.isCordova = true', '.isDesktop= true');
            fileContents = fileContents.replace(
                /\((\w+.)(isCordova)\)([\S\s]*?)(startupDidComplete)/,
                '($1isDesktop)$3$4');
            fs.writeFileSync(join(appDir, file.path), fileContents);
        }
    });

    if (!injected) {
        console.error('Error injecting isDesktop global var.');
        process.exit(1);
    }

    this._log.info('injected isDesktop');

    // Copy cordova.js to the app bundle.
    shell.cp(join(__dirname, 'templates', 'cordova.js'), appDir);

    if (done) done();
};

App.prototype.ensureDeps = function ensureDeps(done) {
    var version = null;
    var version3 = null;
    var execResult;
    var npm;
    var npmCmd;
    var pwd = shell.pwd();

    this._log.info('ensuring desktop dependencies');

    shell.cd(this.$.env.app.root);

    if (shell.which('npm')) {
        execResult = shell.exec('npm --version', { silent: true });
        if (execResult.code === 0) {
            version = execResult.stdout;
        }
    }

    if (version !== null && semver.satisfies(version, '>= 3.0.0')) {
        npm = 'npm';
    }

    if (!npm) {
        if (shell.which('npm3')) {
            execResult = shell.exec('npm3 --version', { silent: true });
            if (execResult.code === 0) {
                version3 = execResult.stdout;
            }
        }

        if (version3 === null) {
            console.error(
                'Please install npm in >= 3.0.0! You can do a `npm install -g npm3` if you ' +
                'want npm3 separately. This package will search for either npm or npm3 globally.'
            );
            process.exit(1);
        }
        npm = 'npm3';
    }

    npmCmd = npm + (this.$.env.os.is_windows ? '.cmd' : '');

    spawn(npmCmd, ['i'], {
        cwd: this.$.env.app.root,
        stdio: this.$.env.stdio
    }).on('exit', done);

    shell.cd(pwd);
};

module.exports = function exports($, runFromDist) {
    return new App($, runFromDist);
};
