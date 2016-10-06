/* eslint-disable import/no-unresolved */
/* eslint-disable global-require */

import electron from 'electron';
import { EventEmitter as Events } from 'events';
import path from 'path';
import fs from 'fs-plus';
import shell from 'shelljs';
import assignIn from 'lodash/assignIn';
import { spawnSync } from 'child_process';
import winston from 'winston';
import Module from './modules/module.js';

const { app, BrowserWindow, dialog } = electron;
const { join } = path;

process.env.NODE_PATH = join(__dirname, 'node_modules');
require('module').Module._initPaths();

/**
 * This is the main app which is a skeleton for the whole integration.
 * Here all the plugins/modules are loaded, local server is spawned and autoupdate is initialized.
 */
class App {

    constructor() {
        this.getOsSpecificValues();

        this.initLogger();
        this.configureLogger();

        this.l = winston.loggers.get('main');
        this.l.info('app data dir is:', this.userDataDir);

        this.l.info('starting app');

        this.settings = {
            devTools: false
        };
        this.desktopPath = path.resolve(join(__dirname, '..', 'desktop.asar'));
        this.loadSettings();

        if ('builderOptions' in this.settings && this.settings.builderOptions.appId) {
            app.setAppUserModelId(this.settings.builderOptions.appId);
        }
        this.l.debug(`initial desktop version is ${this.settings.desktopVersion}`);

        if (this.handleSquirrelEvents()) {
            app.quit();
            return;
        }

        if (this.resolveDesktopPath()) {
            // Refresh setting because we will use different desktop.asar version.
            this.loadSettings();
        }

        // System events emitter.
        this.systemEvents = new Events();

        this.desktop = null;
        this.app = app;
        this.window = null;
        this.windowAlreadyLoaded = false;
        this.webContents = null;
        this.modules = {};
        this.localServer = null;


        this.catchUncaughtExceptions();

        if (this.isProduction()) {
            // In case anything depends on this...
            process.env.NODE_ENV = 'production';
        } else {
            import electronDebug from 'electron-debug';
            electronDebug({
                showDevTools: true,
                enabled: (this.settings.devTools !== undefined) ? this.settings.devTools : true
            });
        }

        this.prepareWindowSettings();

        this.meteorAppVersionChange = false;
        this.desktopVersionChange = null;
        this.systemEvents.on('newVersionReady', (desktopVersion) => {
            this.meteorAppVersionChange = true;
            this.desktopVersionChange = desktopVersion;
        });
        this.systemEvents.on('revertVersionReady', () => (this.meteorAppVersionChange = true));

        this.app.on('ready', this.onReady.bind(this));
        this.app.on('window-all-closed', () => this.app.quit());
    }

    handleSquirrelEvents() {
        if (process.platform !== 'win32') {
            return false;
        }

        const squirrelCommand = process.argv[1];
        if (!squirrelCommand || squirrelCommand.substr(0, '--squirrel'.length) !== '--squirrel') {
            return false;
        }

        switch (squirrelCommand) {
            case '--squirrel-install':
                this.createShortcuts();
                break;
            case '--squirrel-firstrun':
                return false;
                break;
            case '--squirrel-updated':
                this.updateShortcuts();
                break;
            case '--squirrel-uninstall':
                this.removeShortcuts();
                break;
            default:
                return false;
        }

        return true;
    }

    spawnUpdate(args) {
        const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
        this.l.debug(`Spawning ${updateExe} with args ${args.join(',')}`);
        spawnSync(updateExe, args);
    }

    removeShortcuts() {
        const exeName = path.basename(process.execPath);
        this.spawnUpdate(['--removeShortcut', exeName]);
    }

    createShortcuts() {
        const exeName = path.basename(process.execPath);
        this.spawnUpdate(['--createShortcut', exeName])
    }

    updateShortcuts() {
        const homeDirectory = fs.getHomeDirectory();
        if (homeDirectory) {
            const exeName = path.basename(process.execPath, '.exe');
            dialog.showErrorBox('Application', path.join(homeDirectory, 'Desktop', exeName + '.lnk'));
            const desktopShortcutPath = path.join(homeDirectory, 'Desktop', exeName + '.lnk');
            if (fs.existsSync(desktopShortcutPath)) {
                this.createShortcuts();
            }
        } else {
            this.createShortcuts();
        }
    }

    /**
     * Decides where the current desktop.asar lies. Takes into account desktopHCP.
     * Also supports falling back to last known good version Meteor mechanism.
     */
    resolveDesktopPath() {
        let changed = false;
        // Read meteor's initial asset bundle version.
        const initialVersion = this.readInitialAssetBundleVersion();

        this.autoupdate = null;
        this.autoupdateConfig = join(this.userDataDir, 'autoupdate.json');
        this.readConfig();

        if (this.autoupdate.lastSeenInitialVersion !== initialVersion) {
            this.l.warn(`will use desktop.asar from initial version beacuse the initial version of meteor app has changed: ${this.desktopPath}`);
            return;
        }

        // We have a last downloaded version.
        if (this.autoupdate.lastDownloadedVersion) {
            // But it might be blacklisted.
            if (~this.autoupdate.blacklistedVersions.indexOf(this.autoupdate.lastDownloadedVersion)) {
                // Lets check if we have last known good version.
                if (this.autoupdate.lastKnownGoodVersion) {
                    // If this is different from the initial version.
                    if (this.autoupdate.lastKnownGoodVersion !== this.autoupdate.lastSeenInitialVersion) {

                        const desktopVersion = this.readDesktopVersionFromBundle(this.autoupdate.lastKnownGoodVersion);
                        if (desktopVersion.version) {
                            if (desktopVersion.version !== this.settings.desktopVersion) {
                                this.desktopPath = join(this.userDataDir, 'versions', `${desktopVersion.version}_desktop.asar`);
                                changed = true;
                                this.l.warn(`will use desktop.asar from last known good version at: ${this.desktopPath}`);
                            } else {
                                this.l.warn(`will use desktop.asar from initial version because last known good version of meteor app is using it: ${this.desktopPath}`);
                            }
                        } else {
                            this.l.warn(`will use desktop.asar from inital version because last known good version of meteor app does not contain new desktop version: ${this.desktopPath}`);
                        }
                    } else {
                        this.l.info(`will use desktop.asar from last known good version which is apparently the initial bundle: ${this.desktopPath}`);
                    }
                } else {
                    this.l.warn(`will use desktop.asar from initial version as a fallback: ${this.desktopPath}`);
                }
            } else {
                if (this.autoupdate.lastDownloadedVersion !== this.autoupdate.lastSeenInitialVersion) {
                    const desktopVersion = this.readDesktopVersionFromBundle(this.autoupdate.lastDownloadedVersion);
                    if (desktopVersion.version) {
                        if (desktopVersion.version !== this.settings.desktopVersion) {
                            this.desktopPath = join(this.userDataDir, 'versions', `${desktopVersion.version}_desktop.asar`);
                            changed = true;
                            this.l.warn(`will use desktop.asar from last downloaded version at: ${this.desktopPath}`);
                        } else {
                            this.l.warn(`will use desktop.asar from initial version because last downloaded version is using it: ${this.desktopPath}`);
                        }
                    } else {
                        this.l.warn(`will use desktop.asar from inital version from last downloaded version does not contain new desktop version: ${this.desktopPath}`);
                    }
                } else {
                    this.l.info(`will use desktop.asar from last downloaded version which is apparently the initial bundle: ${this.desktopPath}`);
                }
            }
        } else {
            this.l.info(`using desktop.asar from initial bundle: ${this.desktopPath}`);
        }
        return changed;
    }

    readDesktopVersionFromBundle(version) {
        let desktopVersion;
        try {
            return JSON.parse(fs.readFileSync(join(this.userDataDir, 'versions', version, '_desktop.json'), 'UTF-8'));
        } catch (e) {
            return {};
        }
    }

    readInitialAssetBundleVersion() {
        let desktopVersion;
        try {
            return JSON.parse(fs.readFileSync(path.resolve(join(__dirname, '..', 'meteor.asar', 'program.json')), 'UTF-8')).version;
        } catch (e) {
            return {};
        }
    }

    /**
     * Reads config json file.
     * @private
     */
    readConfig() {
        try {
            this.autoupdate = JSON.parse(fs.readFileSync(this.autoupdateConfig, 'UTF-8'));
        } catch (e) {
            this.autoupdate = {};
        }
    }

    /**
     * Checks whether this is a production build.
     * @returns {boolean}
     */
    isProduction() {
        return ('env' in this.settings && this.settings.env === 'prod');
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
     * Merges window settings specific to current os.
     */
    mergeOsSpecificWindowSettings() {
        ['windows', 'linux', 'osx'].forEach(system => {
            if (
                this.os[`is${system[0].toUpperCase()}${system.substring(1)}`] &&
                (`_${system}`) in this.settings.window
            ) {
                assignIn(this.settings.window, this.settings.window[`_${system}`]);
            }
        });
    }

    /**
     * Merges window dev settings.
     */
    mergeWindowDevSettings() {
        if (!this.isProduction() && 'windowDev' in this.settings) {
            assignIn(this.settings.window, this.settings.windowDev);
        }
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
     * Register on uncaughtExceptions so we can handle them.
     */
    catchUncaughtExceptions() {
        process.on('uncaughtException', error => {
            this.l.error(error);
            try {
                this.systemEvents.emit('unhandledException');
            } catch (e) {
                this.l.warn('could not emit unhandledException');
            }
            try {
                this.window.close();
            } catch (e) {
                // Empty catch block... nasty...
            }
            setTimeout(() => {
                dialog.showErrorBox('Application', 'Internal error occurred. Restart this ' +
                    'application. If the problem persist, contact support or try to reinstall.');
                this.app.quit();
            }, 500);
        });
    }

    /**
     * Applies os specific settings and sets proper icon path.
     */
    prepareWindowSettings() {
        if (!('window' in this.settings)) {
            this.settings.window = {};
        }
        this.mergeWindowDevSettings();
        this.mergeOsSpecificWindowSettings();
        this.applyVars(this.settings.window);
        console.log(this.settings.window);
    }

    applyVars(object) {
        Object.keys(object).forEach((key) => {
           if (key[0] !== '_') {
               if (typeof object[key] === 'object') {
                   this.applyVars(object[key]);
               } else if (typeof object[key] === 'string') {
                   if (~object[key].indexOf('@assets')) {
                       object[key] = path.join(this.desktopPath, 'assets', object[key].replace(/@assets\//gmi, ''));
                   }
               }
           }
        });
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

        this.loadPlugins();
        try {
            this.systemEvents.emit('beforeModulesLoad');
        } catch (e) {
            this.l.error(`error while handling 'beforeModulesLoad' event: ${e}`);
        }

        this.loadModules();

        try {
            this.systemEvents.emit('beforeDesktopLoad');
        } catch (e) {
            this.l.error(`error while handling 'beforeDesktopLoad' event: ${e}`);
        }


        try {
            const desktopJsPath = join(this.desktopPath, 'desktop.js');
            const desktop = require(desktopJsPath);
            this.desktop = desktop(
                winston,
                this.app,
                this.settings,
                this.systemEvents,
                this.modules,
                Module
            );
            this.systemEvents.emit('desktopLoaded', this.desktop);
            this.l.debug('desktop loaded');
        } catch (e) {
            this.l.warn('could not load desktop.js');
        }

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
    }

    /**
     * On server restart point chrome to the new port.
     * @param {integer} port - Port on which the app is served.
     */
    onServerRestarted(port) {
        this.webContents.loadURL(`http://127.0.0.1:${port}/`);
    }

    /**
     * Loads and initializes all plugins listed in settings.json.
     */
    loadPlugins() {
        if ('plugins' in this.settings) {
            Object.keys(this.settings.plugins).forEach(plugin => {

                try {
                    this.l.debug(`loading plugin: ${plugin}`);
                    this.modules[plugin] = require(plugin);
                    const Plugin = this.modules[plugin];
                    this.configureLogger(plugin);
                    this.modules[plugin] = new Plugin(
                        winston,
                        this.app,
                        this.settings,
                        this.systemEvents,
                        this.modules,
                        this.settings.plugins[plugin],
                        Module
                    );
                } catch (e) {
                    // TODO: its probably safer not to exit here, but a strategy for handling this would be better.
                    this.l.error(`error while loading plugin: ${e}`);
                }

            });
        }
    }

    /**
     * Loads and initializes internal and app modules.
     */
    loadModules() {
        let moduleName;

        // Load internal modules. Scan for files in /modules.
        shell.ls(join(__dirname, 'modules', '*.js')).forEach(file => {
            if (!~file.indexOf('module.js')) {
                moduleName = path.parse(file).name;
                this.l.debug(`loading module: ${file}`);
                this.modules[moduleName] = require(file);
                const InternalModule = this.modules[moduleName];
                const settings = {};
                if (moduleName === 'autoupdate') {
                    settings.dataPath = this.userDataDir;
                    settings.bundleStorePath = this.userDataDir;
                    settings.initialBundlePath = path.join(__dirname, '..', 'meteor.asar');
                    settings.webAppStartupTimeout =
                        this.settings.webAppStartupTimeout ?
                            this.settings.webAppStartupTimeout : 20000;
                }
                this.configureLogger(moduleName);
                this.modules[moduleName] = new InternalModule(
                    winston,
                    this.app,
                    this.settings,
                    this.systemEvents,
                    this.modules,
                    settings,
                    Module
                );
            }
        });

        // Now go through each directory. If there is a index.js then it should be a module.
        fs.readdirSync(join(this.desktopPath, 'modules')).forEach(dir => {
            try {
                const modulePath = join(this.desktopPath, 'modules', dir);
                if (fs.lstatSync(modulePath).isDirectory()) {
                    moduleName = path.parse(modulePath).name;
                    this.l.debug(`loading module: ${dir} => ${moduleName}`);
                    let settings = {};
                    // module.json is mandatory, but we can live without it.
                    try {
                        let moduleJson = {};
                        moduleJson = JSON.parse(
                            fs.readFileSync(path.join(modulePath, 'module.json'), 'UTF-8')
                        );
                        if ('settings' in moduleJson) {
                            settings = moduleJson.settings;
                        }
                        if ('name' in moduleJson) {
                            moduleName = moduleJson.name;
                        }
                        if ('extract' in moduleJson) {
                            settings['extractedFilesPath'] =
                                join(__dirname, '..', 'extracted', moduleName);
                        }
                    } catch (e) {
                        this.l.warn(`could not load ${path.join(modulePath, 'module.json')}`);
                    }
                    this.modules[moduleName] = require(path.join(modulePath, 'index.js'));
                    const AppModule = this.modules[moduleName];
                    this.configureLogger(moduleName);
                    this.modules[moduleName] = new AppModule(
                        winston,
                        this.app,
                        this.settings,
                        this.systemEvents,
                        this.modules,
                        settings,
                        Module
                    );
                }
            } catch (e) {
                this.l.warn(e);
            }
        });
    }

    /**
     * Handle startup failure.
     * @param {integer} code - Error code from local server.
     */
    onStartupFailed(code) {
        this.systemEvents.emit('startupFailed');
        dialog.showErrorBox('Startup error', 'Could not initialize app. Please contact' +
            ` your support. Error code: ${code}`);
        this.app.quit();
    }

    /**
     * Starts the app loading in the browser.
     * @param {integer} port - Port on which our local server is listening.
     */
    onServerReady(port) {
        const windowSettings = {
            width: 800, height: 600,
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
        this.webContents = this.window.webContents;

        this.systemEvents.emit('windowOpened', this.window);

        // Here we are catching reloads triggered by hot code push.
        this.webContents.on('will-navigate', event => {
            // We need to block it.
            event.preventDefault();

            console.log('refresh', this.meteorAppVersionChange);
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
                    this.systemEvents.emit('beforeLoadingFinished');
                    this.window.show();
                    this.window.focus();
                    if (this.settings.devtron && !this.isProduction()) {
                        this.webContents.executeJavaScript('Desktop.devtron.install()');
                    }
                }
            }
            console.log('loadingFinished');
            this.systemEvents.emit('loadingFinished');
        });
        this.webContents.loadURL(`http://127.0.0.1:${port}/`);
    }

    updateToNewVersion() {
        this.systemEvents.emit(
            'beforeReload', this.modules.autoupdate.getPendingVersion());

        if (this.settings.desktopHCP && this.settings.desktopVersion !== this.desktopVersionChange) {
            this.l.info('relaunching to use different version of desktop.asar');
            app.relaunch({ args: process.argv.slice(1) + ['--hcp'] });
            app.exit(0)
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

    initLogger() {
        const fileLogConfiguration = {
            level: 'debug',
            filename: join(this.userDataDir, 'run.log'),
            handleExceptions: true,
            json: false,
            maxsize: 5242880, //5MB
            maxFiles: 5,
            colorize: false
        };
        const consoleLogConfiguration = {
            level: 'debug',
            handleExceptions: true,
            json: false,
            colorize: true
        };

        this.loggerTransports = [
            new (winston.transports.Console)(consoleLogConfiguration),
            new (winston.transports.File)(fileLogConfiguration)
        ];

        // TODO: seems that every logger that shares this default transports also registers for exceptions because handleExceptions is true - is this winston bug?
        winston.loggers.options.transports = this.loggerTransports;
    }


    /**
     * Returns a new logger instance.
     * @param {string} entityName
     * @returns {Log}
     */
    configureLogger(entityName = 'main') {
        const transports = [];
        winston.loggers.add(entityName, {});

        const logger = winston.loggers.get(entityName);
        if (entityName !== 'main') {
            logger.add(winston.transports.File, {
                level: 'debug',
                name: entityName,
                handleExceptions: false,
                filename: join(this.userDataDir, `${entityName}.log`)
            });
        }

        logger.filters.push((level, msg) => `[${entityName}] ${msg}`);
        logger._name = entityName;

        logger.getLoggerFor = (subEntityName) => {
            if (!winston.loggers.loggers[`${logger._name}__${subEntityName}`]) {
                winston.loggers.add(`${logger._name}__${subEntityName}`, {});
                const newLogger = winston.loggers.get(`${logger._name}__${subEntityName}`);
                newLogger.filters.push((level, msg) => `[${logger._name}] [${subEntityName}] ${msg}`);
                newLogger.getLoggerFor = logger.getLoggerFor;
                return newLogger;
            }
            return winston.loggers.get(`${logger._name}__${subEntityName}`);
        }
    }
}

const appInstance = new App();
