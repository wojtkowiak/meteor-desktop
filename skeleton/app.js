/* eslint-disable import/no-unresolved */
/* eslint-disable global-require, import/no-dynamic-require */

import electron from 'electron';
import { EventEmitter as Events } from 'events';
import path from 'path';
import fs from 'fs-plus';

import shell from 'shelljs';
import assignIn from 'lodash/assignIn';
import winston from 'winston';
import Module from './modules/module';
import LoggerManager from './loggerManager';
import DesktopPathResolver from './desktopPathResolver';
import WindowSettings from './windowSettings';
import Squirrel from './squirrel';

const { app, BrowserWindow, dialog } = electron;
const { join } = path;

// To make desktop.asar's downloaded through HCP work, we need to provide them a path to
// node_modules.
require('module').globalPaths.push(path.resolve(join(__dirname, '..', 'node_modules')));

/**
 * This is the main app which is a skeleton for the whole integration.
 * Here all the plugins/modules are loaded, local server is spawned and autoupdate is initialized.
 * @class
 */
class App {

    constructor() {
        // Until user defined handling will be loaded it is good to register something
        // temporarily.
        this.catchUncaughtExceptions();

        this.getOsSpecificValues();

        this.loggerManager = new LoggerManager(this);
        this.l = this.loggerManager.getMainLogger();

        this.l.info('app data dir is:', this.userDataDir);

        this.settings = {
            devTools: false
        };

        this.desktopPath = DesktopPathResolver.resolveDesktopPath(this.userDataDir, this.l);
        this.loadSettings();

        if (Squirrel.handleSquirrelEvents(this.desktopPath)) {
            app.quit();
            return;
        }

        // This is need for OSX - check Electron docs for more info.
        if ('builderOptions' in this.settings && this.settings.builderOptions.appId) {
            app.setAppUserModelId(this.settings.builderOptions.appId);
        }

        // System events emitter.
        this.eventsBus = new Events();

        this.desktop = null;
        this.app = app;
        this.window = null;
        this.windowAlreadyLoaded = false;
        this.webContents = null;
        this.modules = {};
        this.localServer = null;

        if (this.isProduction()) {
            // In case anything depends on this...
            process.env.NODE_ENV = 'production';
        } else {
            require('electron-debug')({
                showDevTools: process.env.ELECTRON_ENV !== 'test',
                enabled: (this.settings.devTools !== undefined) ? this.settings.devTools : true
            });
        }

        this.prepareWindowSettings();

        this.meteorAppVersionChange = false;
        this.pendingDesktopVersion = null;
        this.eventsBus.on('newVersionReady', (desktopVersion) => {
            this.meteorAppVersionChange = true;
            this.pendingDesktopVersion = desktopVersion;
        });
        this.eventsBus.on('revertVersionReady', () => (this.meteorAppVersionChange = true));

        this.app.on('ready', this.onReady.bind(this));
        this.app.on('window-all-closed', () => this.app.quit());
    }

    /**
     * Prepares all the values that are dependant on os.
     */
    getOsSpecificValues() {
        this.os = {
            isWindows: (process.platform === 'win32'),
            isLinux: (process.platform === 'linux'),
            isOsx: (process.platform === 'darwin')
        };

        this.userDataDir = app.getPath('userData');
    }

    /**
     * Checks whether this is a production build.
     * @returns {boolean}
     * @api
     */
    isProduction() {
        return ('env' in this.settings && this.settings.env === 'prod');
    }

    /**
     * Tries to load the settings.json.
     */
    loadSettings() {
        try {
            this.settings = JSON.parse(
                fs.readFileSync(join(this.desktopPath, 'settings.json')), 'UTF-8');
        } catch (e) {
            this.l.error(e);
            dialog.showErrorBox('Application', 'Could not read settings.json. Please reinstall' +
                ' this application.');

            if (this.app && this.app.quit) {
                this.app.quit();
            }
            process.exit(1);
        }
    }

    /**
     * Removes default uncaught exception listener.
     * But still leaves logging and emitting
     * @api
     */
    removeUncaughtExceptionListener() {
        process.removeListener('uncaughtException', this.uncaughtExceptionHandler);
    }

    /**
     * Logs the error and emits an unhandledException event on the events bus.
     * @param error
     */
    emitErrorAndLogIt(error) {
        try {
            this.l.error(error);
            if (this.eventsBus) {
                this.eventsBus.emit('unhandledException', error);
            }
        } catch (e) {
            // Well...
        }
    }

    /**
     * Register on uncaughtExceptions so we can handle them.
     */
    catchUncaughtExceptions() {
        this.uncaughtExceptionHandler = this.uncaughtExceptionHandler.bind(this);
        process.on('uncaughtException', this.emitErrorAndLogIt.bind(this));
        process.on('uncaughtException', this.uncaughtExceptionHandler);
    }

    /**
     * Default uncaught exception handler.
     */
    uncaughtExceptionHandler() {
        try {
            // this.window.close();
        } catch (e) {
            // Empty catch block... nasty...
        }
        setTimeout(() => {
            dialog.showErrorBox('Application', 'Internal error occurred. Restart this ' +
                'application. If the problem persists, contact support or try to reinstall.');
            this.app.quit();
        }, 500);
    }


    /**
     * Applies dev, os specific and variables to window settings.
     */
    prepareWindowSettings() {
        if (!('window' in this.settings)) {
            this.settings.window = {};
        }
        if (!this.isProduction()) {
            WindowSettings.mergeWindowDevSettings(this.settings);
        }
        WindowSettings.mergeOsSpecificWindowSettings(this.settings, this.os);
        WindowSettings.applyVars(this.settings.window, this.desktopPath);
    }

    /**
     * Loads and initializes all plugins listed in settings.json.
     */
    loadPlugins() {
        if ('plugins' in this.settings) {
            Object.keys(this.settings.plugins).forEach((plugin) => {
                try {
                    this.l.debug(`loading plugin: ${plugin}`);
                    this.modules[plugin] = require(plugin).default;

                    const Plugin = this.modules[plugin];

                    this.modules[plugin] = new Plugin({
                        log: this.loggerManager.configureLogger(plugin),
                        skeletonApp: this,
                        appSettings: this.settings,
                        eventsBus: this.eventsBus,
                        modules: this.modules,
                        settings: typeof this.settings.plugins[plugin] === 'object' ?
                            this.settings.plugins[plugin] : {},
                        Module
                    });
                } catch (e) {
                    // TODO: its probably safer not to exit here
                    // but a strategy for handling this would be better.
                    this.l.error(`error while loading plugin: ${e}`);
                }
            });
        }
    }

    /**
     * Loads and initializes internal and app modules.
     */
    loadModules() {
        // Load internal modules. Scan for files in /modules.
        shell.ls(join(__dirname, 'modules', '*.js')).forEach((file) => {
            if (!~file.indexOf('module.js')) {
                this.loadModule(true, file);
            }
        });

        // Now go through each directory in .desktop/modules.
        fs.readdirSync(join(this.desktopPath, 'modules')).forEach((dirName) => {
            try {
                const modulePath = join(this.desktopPath, 'modules', dirName);
                if (fs.lstatSync(modulePath).isDirectory()) {
                    this.loadModule(false, modulePath, dirName);
                }
            } catch (e) {
                this.l.error(`error while trying to load module in dir ${dirName}: ${e}`);
            }
        });
    }

    /**
     * Tries to read a module's module.json file.
     * @param modulePath
     * @returns {{settings: {}, moduleName: *}}
     */
    static readModuleConfiguration(modulePath) {
        let settings = {};
        let moduleName = null;
        const moduleJson = JSON.parse(
            fs.readFileSync(path.join(modulePath, 'module.json'), 'UTF-8')
        );
        if ('settings' in moduleJson) {
            settings = moduleJson.settings;
        }
        if ('name' in moduleJson) {
            moduleName = moduleJson.name;
        }
        // Inject extractedFilesPath.
        if ('extract' in moduleJson) {
            settings.extractedFilesPath =
                join(__dirname, '..', 'extracted', moduleName);
        }
        return { settings, moduleName };
    }

    /**
     * Load a module.
     * @param {boolean} internal   - whether that is an internal module
     * @param {string}  modulePath - path to the module
     * @param {string}  dirName    - directory name of the module
     */
    loadModule(internal, modulePath, dirName = '') {
        let moduleName = path.parse(modulePath).name;
        let settings = {};
        let indexPath = '';

        if (!internal) {
            // module.json is mandatory, but we can live without it.
            try {
                const result = App.readModuleConfiguration(modulePath);
                assignIn(settings, result.settings);
                if (result.moduleName) {
                    moduleName = result.moduleName;
                }
            } catch (e) {
                this.l.warn(`could not load ${path.join(modulePath, 'module.json')}`);
            }
            this.l.debug(`loading module: ${dirName} => ${moduleName}`);
            indexPath = path.join(modulePath, 'index.js');
        } else {
            this.l.debug(`loading internal module: ${moduleName}`);
            indexPath = modulePath;
        }

        const AppModule = require(indexPath).default;

        if (internal && moduleName === 'autoupdate') {
            settings = this.prepareAutoupdateSettings();
        }

        this.modules[moduleName] = new AppModule({
            log: this.loggerManager.configureLogger(moduleName),
            skeletonApp: this,
            appSettings: this.settings,
            eventsBus: this.eventsBus,
            modules: this.modules,
            settings,
            Module
        });
    }

    /**
     * Tries to load desktop.js.
     */
    loadDesktopJs() {
        try {
            const desktopJsPath = join(this.desktopPath, 'desktop.js');

            const Desktop = require(desktopJsPath).default;
            this.desktop = new Desktop({
                log: this.loggerManager.configureLogger('desktop'),
                skeletonApp: this,
                appSettings: this.settings,
                eventsBus: this.eventsBus,
                modules: this.modules,
                Module
            });
            this.modules.desktop = this.desktop;
            this.eventsBus.emit('desktopLoaded', this.desktop);
            this.l.debug('desktop loaded');
        } catch (e) {
            this.l.error('could not load desktop.js', e);
        }
    }

    /**
     * Util function for emitting events on the event bus.
     * @param {string} event - event name
     * @param {[*]}    args  - event's arguments
     */
    emit(event, ...args) {
        try {
            this.eventsBus.emit(event, ...args);
        } catch (e) {
            this.l.error(`error while emitting '${event}' event: ${e}`);
        }
    }

    /**
     * Initializes this app.
     * Loads plugins.
     * Loads modules.
     * Loads desktop.js.
     * Initializes local server.
     */
    onReady() {
        this.l.info('ready fired');

        Squirrel.setUpAutoUpdater(this);

        this.emit('beforePluginsLoad');

        this.loadPlugins();

        this.emit('beforeModulesLoad');

        this.loadModules();

        this.emit('beforeDesktopJsLoad');

        // desktopLoaded event in emitted from the inside of loadDesktopJs
        this.loadDesktopJs();

        this.localServer = this.modules.localServer;

        this.localServer.setCallbacks(
            this.onStartupFailed.bind(this),
            this.onServerReady.bind(this),
            this.onServerRestarted.bind(this)
        );

        this.localServer.init(
            this.modules.autoupdate.getDirectory(),
            this.modules.autoupdate.getParentDirectory()
        );

        this.emit('afterInitialization');
    }

    /**
     * On server restart point chrome to the new port.
     * @param {number} port - port on which the app is served
     */
    onServerRestarted(port) {
        this.webContents.loadURL(`http://127.0.0.1:${port}/`);
    }

    /**
     * Returns prepared autoupdate module settings.
     * @returns {{dataPath: *, desktopBundlePath: String, bundleStorePath: *, initialBundlePath,
      * webAppStartupTimeout: number}}
     */
    prepareAutoupdateSettings() {
        return {
            dataPath: this.userDataDir,
            desktopBundlePath: this.userDataDir,
            bundleStorePath: this.userDataDir,
            initialBundlePath: path.join(__dirname, '..', 'meteor.asar'),
            webAppStartupTimeout: this.settings.webAppStartupTimeout ?
                this.settings.webAppStartupTimeout : 20000
        };
    }

    /**
     * Handle startup failure.
     * @param {number} code - error code from local server
     */
    onStartupFailed(code) {
        this.eventsBus.emit('startupFailed');
        dialog.showErrorBox('Startup error', 'Could not initialize app. Please contact' +
            ` your support. Error code: ${code}`);
        this.app.quit();
    }

    /**
     * Starts the app loading in the browser.
     * @param {number} port - port on which our local server is listening
     */
    onServerReady(port) {
        const windowSettings = {
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: false, // node integration must to be off
                preload: join(__dirname, 'preload.js')
            },
            show: false
        };

        if ('webPreferences' in this.settings.window &&
            'nodeIntegration' in this.settings.window.webPreferences &&
            this.settings.window.webPreferences.nodeIntegration === true) {
            // Too risky to allow that... sorry.
            this.settings.window.webPreferences.nodeIntegration = false;
        }

        assignIn(windowSettings, this.settings.window);

        this.window = new BrowserWindow(windowSettings);
        this.window.on('closed', () => { this.window = null; });

        this.webContents = this.window.webContents;

        this.eventsBus.emit('windowCreated', this.window);

        // Here we are catching reloads triggered by hot code push.
        this.webContents.on('will-navigate', (event) => {
            // We need to block it.
            event.preventDefault();

            if (this.meteorAppVersionChange) {
                this.updateToNewVersion();
            }
            this.meteorAppVersionChange = false;
        });

        // The app was loaded.
        this.webContents.on('did-stop-loading', () => {
            if (!this.windowAlreadyLoaded) {
                if (this.meteorAppVersionChange) {
                    this.updateToNewVersion();
                } else {
                    this.windowAlreadyLoaded = true;
                    this.eventsBus.emit('beforeLoadFinish');
                    this.window.show();
                    this.window.focus();
                    if (this.settings.devtron && !this.isProduction()) {
                        this.webContents.executeJavaScript('Desktop.devtron.install()');
                    }
                }
            }
            this.eventsBus.emit('loadingFinished');
        });
        this.webContents.loadURL(`http://127.0.0.1:${port}/`);
    }

    /**
     * Updates to the new version received from hot code push.
     */
    updateToNewVersion() {
        try {
            this.eventsBus.emit(
                'beforeReload', this.modules.autoupdate.getPendingVersion());
        } catch (e) {
            this.l.warn('error while emitting beforeReload', e);
        }

        if (this.settings.desktopHCP &&
            this.settings.desktopVersion !== this.pendingDesktopVersion
        ) {
            this.l.info('relaunching to use different version of desktop.asar');
            app.relaunch({ args: process.argv.slice(1) + ['--hcp'] });
            app.exit(0);
        } else {
            // Firing reset routine.
            this.modules.autoupdate.onReset();

            // Reinitialize the local server.
            this.localServer.init(
                this.modules.autoupdate.getDirectory(),
                this.modules.autoupdate.getParentDirectory(),
                true
            );
        }
    }
}

const appInstance = new App(); // eslint-disable-line no-unused-vars
