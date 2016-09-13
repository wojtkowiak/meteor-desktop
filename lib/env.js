import path from 'path';
import os from 'os';
import assignIn from 'lodash/assignIn';
const { join } = path;

export default class Env {
    constructor(input, output, options) {
        // Platform and arch type.

        this.options = options;

        this.sys = {
            platform: process.platform,
            arch: process.arch
        };

        // Operational System.
        this.os = {
            isWindows: (process.platform === 'win32'),
            isLinux: (process.platform === 'linux'),
            isOsx: (process.platform === 'darwin')

        };
        this.stdio = 'inherit';

        this.os.name = (this.sys.platform === 'darwin' ? 'osx' : this.sys.platform);
        this.os.home = process.env[(this.os.isWindows ? 'USERPROFILE' : 'HOME')];
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
            import: join(this.paths.desktop.root, 'import'),
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
            desktopAsar: join(this.paths.electronApp.root, 'desktop.asar'),
            extracted: join(this.paths.electronApp.root, 'extracted'),
            appAsar: join(this.paths.electronApp.root, 'app.asar'),
            index: join(this.paths.electronApp.root, 'index.js'),
            app: join(this.paths.electronApp.root, 'app.js'),
            preload: join(this.paths.electronApp.root, 'preload.js'),
            modules: join(this.paths.electronApp.root, 'modules'),
            import: join(this.paths.electronApp.root, 'import'),
            assets: join(this.paths.electronApp.root, 'assets'),
            gitIgnore: join(this.paths.electronApp.root, '.gitignore'),
            packageJson: join(this.paths.electronApp.root, 'package.json'),
            settings: join(this.paths.electronApp.root, 'settings.json'),
            desktop: join(this.paths.electronApp.root, 'desktop.js'),
            desktopTmp: join(this.paths.electronApp.root, '__desktop'),
            nodeModules: join(this.paths.electronApp.root, 'node_modules'),
            meteorApp: join(this.paths.electronApp.root, 'meteor'),
            skeleton: join(this.paths.electronApp.root, 'skeleton')
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

        this.paths.desktopTmp = {
            root: join(this.paths.electronApp.root, '__desktop'),
        };

        assignIn(this.paths.desktopTmp, {
            modules: join(this.paths.desktopTmp.root, 'modules'),
            settings: join(this.paths.desktopTmp.root, 'settings.json')
        });


        this.paths.packageDir = '.meteor-desktop-package';

        // Scaffold
        this.paths.scaffold = join(__dirname, '..', 'scaffold');
    }
}

module.exports = Env;
