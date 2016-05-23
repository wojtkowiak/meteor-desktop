var _ = require('lodash');
var join = require('path').join;
var shell = require('shelljs');

function Electron($) {
    this.$ = $;
    this.log = require('./log')($, 'electron');
}
Electron.prototype.package = function packageApp(packagerOptions, done) {
    var self = this;
    var args;
    var packager = require('electron-packager');

    // fetches electron version from core temp folder
    var version = require(join(
        __dirname,
        '..',
        'node_modules',
        'electron-prebuilt',
        'package.json'
    )).version;

    // app name require('.electrify/package.json').name
    var name = require(join(this.$.env.app.root, 'package.json')).name;

    this.log.info(
        'packaging "' + name + '" for platform ' + this.$.env.sys.platform + '-' +
        this.$.env.sys.arch + ' using electron v' + version
    );

    shell.rm('-rf', this.$.env.app.dist);

    args = {
        name: name,
        version: version,
        arch: this.$.env.sys.arch,
        platform: this.$.env.sys.platform,
        dir: this.$.env.app.root,
        out: this.$.env.app.dist
    };

    _.extend(args, packagerOptions);

    packager(args, function packageTheApp(err, appPath) {
        if (err) throw err;
        self.$.env.setExePath(appPath[0]);
        self.log.info('wrote new app to ', self.$.env.app.dist);
        if (done) done();
    });
};

module.exports = function exports($) {
    return new Electron($);
};
