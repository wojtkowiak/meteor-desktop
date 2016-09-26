import path from 'path';
import os from 'os';
import assignIn from 'lodash/assignIn';

const { join } = path;

/**
 * @class
 * @property {paths} paths
 */
export default class Env {
    constructor(input, output, options) {
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

        /** @type {paths} **/
        this.paths = {};

        /** @type {meteorDesktopPaths} **/
        this.paths.meteorDesktop = {
            root: path.resolve(__dirname, '..')
        };

        this.paths.meteorDesktop.skeleton = join(this.paths.meteorDesktop.root, 'skeleton');

        /** @type {meteorAppPaths} **/
        this.paths.meteorApp = {
            root: input
        };

        /** @type {desktopPaths} **/
        this.paths.desktop = {
            rootName: '.desktop',
            root: join(this.paths.meteorApp.root, '.desktop')
        };

        assignIn(this.paths.desktop, {
            modules: join(this.paths.desktop.root, 'modules'),
            import: join(this.paths.desktop.root, 'import'),
            assets: join(this.paths.desktop.root, 'assets'),
            settings: join(this.paths.desktop.root, 'settings.json'),
            desktop: join(this.paths.desktop.root, 'desktop.js')
        });

        this.paths.desktop.splashScreen = join(this.paths.desktop.assets, 'splashScreen.png');

        /** @type {electronAppPaths} **/
        this.paths.electronApp = {
            rootName: 'desktop-build',
        };
        this.paths.electronApp.root =
            join(this.paths.meteorApp.root, '.meteor', this.paths.electronApp.rootName);

        this.paths.electronApp.appRoot =
            join(this.paths.electronApp.root, 'app');

        assignIn(this.paths.electronApp, {
            app: join(this.paths.electronApp.appRoot, 'app.js'),
            cordova: join(this.paths.electronApp.appRoot, 'cordova.js'),
            index: join(this.paths.electronApp.appRoot, 'index.js'),
            preload: join(this.paths.electronApp.appRoot, 'preload.js'),
            modules: join(this.paths.electronApp.appRoot, 'modules'),

            desktopAsar: join(this.paths.electronApp.root, 'desktop.asar'),
            extracted: join(this.paths.electronApp.root, 'extracted'),
            appAsar: join(this.paths.electronApp.root, 'app.asar'),
            import: join(this.paths.electronApp.root, 'import'),
            assets: join(this.paths.electronApp.root, 'assets'),
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
            gitIgnore: join(this.paths.meteorApp.root, '.meteor', '.gitignore'),
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

        /** @type {desktopTmpPaths} **/
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

/**
 * @typedef {Object} desktopPaths
 * @property {string} rootName
 * @property {string} root
 * @property {string} modules
 * @property {string} import
 * @property {string} assets
 * @property {string} settings
 * @property {string} desktop
 * @property {string} splashScreen
 */

/**
 * @typedef {Object} meteorAppPaths
 * @property {string} root
 * @property {string} platforms
 * @property {string} release
 * @property {string} gitIgnore
 * @property {string} cordovaBuild
 * @property {string} cordovaBuildIndex
 * @property {string} cordovaBuildProgramJson
 */

/** @typedef {Object} electronAppPaths
 * @property {string} rootName
 * @property {string} root
 * @property {Object} appRoot
 * @property {string} appRoot.cordova
 * @property {string} appRoot.index
 * @property {string} appRoot.app
 * @property {string} appRoot.modules
 * @property {string} desktopAsar
 * @property {string} extracted
 * @property {string} appAsar
 * @property {string} preload
 * @property {string} import
 * @property {string} assets
 * @property {string} gitIgnore
 * @property {string} packageJson
 * @property {string} settings
 * @property {string} desktop
 * @property {string} desktopTmp
 * @property {string} nodeModules
 * @property {string} meteorApp
 * @property {string} skeleton
 */

/**
 * @typedef {Object} desktopTmpPaths
 * @property {string} root
 * @property {string} modules
 * @property {string} settings
 */

/**
 * @typedef {Object} meteorDesktopPaths
 * @property {string} root
 * @property {string} skeleton
 */

/** @typedef {Object} paths
 * @property {meteorAppPaths} meteorApp
 * @property {desktopPaths} desktop
 * @property {electronAppPaths} electronApp
 * @property {desktopTmpPaths} desktopTmp
 * @property {meteorDesktopPaths} meteorDesktop
 * @property {string} packageDir
 * @property {string} scaffold
 */
