var path = require('path');
var fs = require('fs');
var os = require('os');
var assignIn = require('lodash/assignIn');
var join = path.join;

function Env(input, output/*, settings*/) {
    // Platform and arch type.
    this.sys = {
        platform: process.platform,
        arch: process.arch
    };

    // Operational System.
    this.os = {
        is_windows: (process.platform === 'win32'),
        is_linux: (process.platform === 'linux'),
        is_osx: (process.platform === 'darwin')
    };

    this.stdio = 'inherit';

    this.os.name = (this.sys.platform === 'darwin' ? 'osx' : this.sys.platform);
    this.os.home = process.env[(this.os.is_windows ? 'USERPROFILE' : 'HOME')];
    this.os.tmp = os.tmpdir();

    this.build_dir_name = '.medc';

    // app main paths
    this.app = {
        root: path.resolve(join(process.cwd(), this.build_dir_name))
    };

    this.meteor_app = {
        root: join(this.app.root, '..')
    };

    assignIn(this.meteor_app, {
        cordova_build: join(
            this.meteor_app.root,
            '.meteor',
            'local',
            'cordova-build',
            'www',
            'application'
        ),
        desktop: join(this.meteor_app.root, '.desktop')
    });

    this.meteor_app.settings = join(this.meteor_app.desktop, 'settings.json');

    assignIn(this.app, {
        modules: join(this.app.root, 'modules'),
        bundled_app: join(this.app.root, 'meteor'),
        dist: join(this.meteor_app.root, '.medc-build')
    });


    if (fs.existsSync(this.meteor_app.settings)) {
        this.app.settings = require(this.meteor_app.settings);
    } else {
        this.app.settings = {
            name: 'My Meteor Client',
            projectName: 'meteor-project'
        };
    }

    // Finds user's data dirctory.
    if (this.os.is_windows) {
        this.app.user_data_dir = process.env.APPDATA;
    } else if (this.os.is_osx) {
        this.app.user_data_dir = join(process.env.HOME, 'Library', 'Preferences');
    } else if (this.os.is_linux) {
        this.app.user_data_dir = join(process.env.HOME, 'var', 'local');
    }

    this.app.distExe = null;
}

Env.prototype.setExePath = function setExePath(packagePath) {
    var extension = '';
    var command = '';
    if (this.os.is_windows) {
        extension = '.exe';
    }
    if (this.os.is_osx) {
        extension = '.app';
        command = 'open ';
    }
    this.app.distExe = command + join(packagePath, this.app.settings.projectName + extension);
};

module.exports = function exports() {
    return new Env();
};
