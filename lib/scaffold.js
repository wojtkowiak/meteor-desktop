var fs = require('fs');
var path = require('path');
var shell = require('shelljs');
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
    var packageJson = join(this.$.env.app.root, 'package.json');
    var gitignore = join(this.$.env.app.root, '.gitignore');

    this.log.info('ensuring basic structure');

    shell.mkdir('-p', this.$.env.app.root);

    // Copy templates.
    shell.cp('-rf', join(__dirname, 'templates', '*'), self.$.env.app.root + path.sep);

    shell.rm('-r', this.$.env.app.modules);

    // Copy modules from this package.
    shell.cp('-rf', join(__dirname, 'modules'), self.$.env.app.root + path.sep);

    // TODO: Copy modules from the meteor app.

    this.log.info('templates copied');

    // TODO: add possibility to add custom packages
    fs.writeFileSync(packageJson, JSON.stringify({
        name: this.$.env.app.settings.projectName,
        main: 'index.js',
        dependencies: {
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
        }
    }, null, 2));

    fs.writeFileSync(gitignore, [
        '.DS_Store', '.dist', 'app',
        'bin', 'db', 'node_modules'
    ].join('\n'));

    this.log.info('created package.json, .gitignore');

    if (fs.existsSync(this.$.env.meteor_app.settings)) {
        this.log.info('copying app settings');

        shell.cp(this.$.env.meteor_app.settings, join(this.$.env.app.root, 'settings.json'));

        this.prepareSplashScreen();
    }
};

Scaffold.prototype.prepareSplashScreen = function prepareSplashScreen() {
    var splashScreen = join(this.$.env.meteor_app.desktop, 'splash_screen.png');
    if (this.$.env.app.settings.splashScreen && fs.existsSync(splashScreen)) {
        this.log.info('installing splash screen');
        shell.cp(splashScreen, join(this.$.env.app.root, 'splash_screen.png'));
        shell.cp(this.$.env.meteor_app.settings, join(this.$.env.app.root, 'settings.json'));
    }
};

module.exports = function exports($) {
    return new Scaffold($);
};
