var fs = require('fs');
var path = require('path');
var shell = require('shelljs');
var assignIn = require('lodash/assignIn');
var join = path.join;

/**
 *
 * @param $
 * @constructor
 */
function Scaffold($) {
    this.$ = $;
    this.log = require('./log')($, 'scaffold');
}

Scaffold.prototype.prepare = function prepare() {
    var self = this;
    var moduleConfig;
    var packageJsonPath = join(this.$.env.app.root, 'package.json');
    var gitignore = join(this.$.env.app.root, '.gitignore');
    var deps = {
        connect: '3.4.1',
        'serve-static': '1.10.2',
        'server-destroy': '1.0.1',
        'serve-index': '1.7.3',
        'connect-modrewrite': '0.9.0',
        'electron-debug': '0.6.0',
        winston: '2.2.0',
        'find-port': '2.0.1',
        shelljs: '0.7.0',
        lodash: '4.11.1',
        request: '2.72.0',
        axios: '0.11.0',
        queue: '4.0.0'
    };

    this.log.info('ensuring basic structure');

    //shell.rm('-rf', this.$.env.app.root);
    shell.mkdir('-p', this.$.env.app.root);

    // Copy templates.
    shell.cp('-rf', join(__dirname, 'templates', '*'), self.$.env.app.root + path.sep);

    shell.rm('-r', this.$.env.app.modules);

    // Copy modules from this package.
    shell.cp('-rf', join(__dirname, 'modules'), self.$.env.app.root + path.sep);

    this.log.info('templates copied');

    shell.ls('-d', path.join(this.$.env.meteorApp.desktop, 'modules', '*')).forEach(
        function eachModule(module) {
            if (fs.lstatSync(module).isDirectory()) {
                // Read config.
                moduleConfig = require(path.join(module, 'module.json'));
                if ('dependencies' in moduleConfig) {
                    // TODO: do not permit overwriting default deps, warn about it
                    assignIn(deps, moduleConfig.dependencies);
                }
            }
        }
    );

    const packageJson = {
        name: this.$.env.app.settings.projectName,
        main: 'index.js',
        dependencies: deps
    };

    if ('packageJsonFields' in this.$.env.app.settings) {
        assignIn(packageJson, this.$.env.app.settings.packageJsonFields);
    }

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // copy app modules.
    shell.cp('-rf', join(this.$.env.meteorApp.desktop, 'modules'), self.$.env.app.root + path.sep);

    if (fs.existsSync(join(this.$.env.meteorApp.desktop, 'desktop.js'))) {
        shell.cp('-rf', join(this.$.env.meteorApp.desktop, 'desktop.js'), self.$.env.app.root + path.sep);
    }

    fs.writeFileSync(gitignore, [
        '.DS_Store', '.dist', 'app',
        'bin', 'db', 'node_modules'
    ].join('\n'));

    this.log.info('created package.json, .gitignore');

    if (fs.existsSync(this.$.env.meteorApp.settings)) {
        this.log.info('copying app settings');

        shell.cp(this.$.env.meteorApp.settings, join(this.$.env.app.root, 'settings.json'));

        this.prepareSplashScreen();
    }
};

Scaffold.prototype.prepareSplashScreen = function prepareSplashScreen() {
    var splashScreen = join(this.$.env.meteorApp.desktop, 'splash_screen.png');
    if (this.$.env.app.settings.splashScreen && fs.existsSync(splashScreen)) {
        this.log.info('installing splash screen');
        shell.cp(splashScreen, join(this.$.env.app.root, 'splash_screen.png'));
        shell.cp(this.$.env.meteorApp.settings, join(this.$.env.app.root, 'settings.json'));
    }
};

module.exports = function exports($) {
    return new Scaffold($);
};
