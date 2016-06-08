var path = require('path');
var fs = require('fs');
var os = require('os');
var assignIn = require('lodash/assignIn');
var join = path.join;

function Env(input, output, options) {
    // Platform and arch type.

    this.options = options;

    this.sys = {
        platform: process.platform,
        arch: process.arch
    };

    // Operational System.
    this.os = {
        is_windows: (process.platform === 'win32'),
        is_linux: (process.platform === 'linux'),
        is_osx: (process.platform === 'darwin'),
        isWindows: (process.platform === 'win32'),
        isLinux: (process.platform === 'linux'),
        isOsx: (process.platform === 'darwin')

    };
    this.stdio = 'inherit';

    this.os.name = (this.sys.platform === 'darwin' ? 'osx' : this.sys.platform);
    this.os.home = process.env[(this.os.is_windows ? 'USERPROFILE' : 'HOME')];
    this.os.tmp = os.tmpdir();

    this.paths = {};

    this.paths.meteorApp = {
        root: input
    };

    this.paths.desktop = {
        rootName: '.desktop',
        root: join(this.paths.meteorApp.root, '.desktop'),
    };

    assignIn(this.paths.desktop, {
        modules: join(this.paths.desktop.root, 'modules'),
        assets: join(this.paths.desktop.root, 'assets'),
        settings: join(this.paths.desktop.root, 'settings.json'),
        desktop: join(this.paths.desktop.root, 'desktop.js')
    });

    this.paths.desktop.splashScreen = join(this.paths.desktop.assets, 'splashScreen.png');

    this.paths.electronApp = {
        rootName: '.meteor-desktop',
        root: join(this.paths.meteorApp.root, '.meteor-desktop'),
    };
    assignIn(this.paths.electronApp, {
        cordova: join(this.paths.electronApp.root, 'cordova.js'),
        index: join(this.paths.electronApp.root, 'index.js'),
        app: join(this.paths.electronApp.root, 'app.js'),
        preload: join(this.paths.electronApp.root, 'preload.js'),
        modules: join(this.paths.electronApp.root, 'modules'),
        assets: join(this.paths.electronApp.root, 'assets'),
        gitIgnore: join(this.paths.electronApp.root, '.gitignore'),
        packageJson: join(this.paths.electronApp.root, 'package.json'),
        settings: join(this.paths.electronApp.root, 'settings.json'),
        desktop: join(this.paths.electronApp.root, 'desktop.js'),
        nodeModules: join(this.paths.electronApp.root, 'node_modules'),
        meteorApp: join(this.paths.electronApp.root, 'meteor')
    });

    assignIn(this.paths.meteorApp, {
        platforms: join(this.paths.meteorApp.root, '.meteor', 'platforms'),
        release: join(this.paths.meteorApp.root, '.meteor', 'release'),
        cordovaBuild: join(
            this.paths.meteorApp.root,
            '.meteor',
            'local',
            'cordova-build',
            'www',
            'application'
        )
    });

    assignIn(this.paths.meteorApp, {
        cordovaBuildIndex: join(
            this.paths.meteorApp.cordovaBuild, 'index.html'),
        cordovaBuildProgramJson: join(
            this.paths.meteorApp.cordovaBuild, 'program.json')
    });

    this.paths.packageDir = '.meteor-desktop-package';


    this.build_dir_name = '.medc';

    // app main paths
    this.app = {
        root: path.resolve(join(output, this.build_dir_name))
    };

    this.meteorApp = {
        root: input
    };

    assignIn(this.meteorApp, {
        cordova_build: join(
            this.meteorApp.root,
            '.meteor',
            'local',
            'cordova-build',
            'www',
            'application'
        ),
        desktop: join(this.meteorApp.root, '.desktop')
    });

    this.meteorApp.settings = join(this.meteorApp.desktop, 'settings.json');

    assignIn(this.app, {
        modules: join(this.app.root, 'modules'),
        assets: join(this.app.root, 'assets'),
        bundled_app: join(this.app.root, 'meteor'),
        dist: join(output, '.medc-package'),
        nodeModules: join(this.app.root, 'node_modules')
    });


    if (fs.existsSync(this.meteorApp.settings)) {
        //console.log(this.meteorApp.settings);
        this.app.settings = require(this.meteorApp.settings);
    } else {
        this.app.settings = {
            name: 'My Meteor Client',
            projectName: 'meteor-project'
        };
    }

    // Finds user's data directory.
    if (this.os.is_windows) {
        this.app.user_data_dir = process.env.APPDATA;
    } else if (this.os.is_osx) {
        this.app.user_data_dir = join(process.env.HOME, 'Library', 'Preferences');
    } else if (this.os.is_linux) {
        this.app.user_data_dir = join(process.env.HOME, 'var', 'local');
    }

    this.app.distExe = null;


    // Scaffold

    this.paths.scaffold = join(__dirname, '..', 'scaffold');
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

module.exports = function exports(input, output, options) {
    return new Env(input, output, options);
};
