/* eslint-disable import/no-unresolved */
/* eslint-disable global-require */

import electron from 'electron';
const { app, BrowserWindow, dialog } = electron;

import { EventEmitter as Events } from 'events';

import path from 'path';
const { join } = path;
import fs from 'fs';
import shell from 'shelljs';
import assignIn from 'lodash/assignIn';

import winston from 'winston';
import electronDebug from 'electron-debug';


process.env.NODE_PATH = join(__dirname, 'node_modules');
require('module').Module._initPaths();

import Module from './modules/module.js';

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
        // System events emitter.
        this.systemEvents = new Events();

        this.desktop = null;
        this.app = app;
        this.window = null;
        this.windowAlreadyLoaded = false;
        this.webContents = null;
        this.modules = {};
        this.localServer = null;

        this.settings = {
            devTools: false
        };

        this.catchUncaughtExceptions();

        this.loadSettings();

        electronDebug({
            showDevTools: true,
            enabled: (this.settings.devTools !== undefined) ? this.settings.devTools : true
        });

        this.prepareWindowSettings();

        this.newVersionReady = false;
        this.systemEvents.on('newVersionReady', () => (this.newVersionReady = true));

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
     * Tries to load the settings.json.
     */
    loadSettings() {
        try {
            this.settings = JSON.parse(fs.readFileSync(join(__dirname, '..', 'desktop.asar', 'settings.json')), 'UTF-8');
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

        this.mergeOsSpecificWindowSettings();

        if ('icon' in this.settings.window) {
            this.settings.window.icon = join(__dirname, '..', 'desktop.asar', 'assets', this.settings.window.icon);
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

        this.loadPlugins();
        this.systemEvents.emit('beforeModulesLoad');
        this.loadModules();

        this.systemEvents.emit('beforeDesktopLoaded');

        try {
            // This is `reify` so we can have nested imports.
            import desktop from '../desktop.asar/desktop.js';
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
        fs.readdirSync(join(__dirname, '..', 'desktop.asar', 'modules')).forEach(dir => {
            try {
                const modulePath = join(__dirname, '..', 'desktop.asar', 'modules', dir);
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

            if (this.newVersionReady) {
                this.systemEvents.emit(
                    'beforeReload', this.modules.autoupdate.getPendingVersion());

                // Firing reset routine.
                this.modules.autoupdate.onReset();

                // Reinitialize the local server.
                this.localServer.init(
                    this.modules.autoupdate.getDirectory(),
                    this.modules.autoupdate.getParentDirectory(),
                    true
                );
            }
            this.newVersionReady = false;
        });

        // The app was loaded.
        this.webContents.on('did-stop-loading', () => {
            if (!this.windowAlreadyLoaded) {
                this.windowAlreadyLoaded = true;
                this.systemEvents.emit('beforeLoadingFinished');
                this.window.show();
                this.window.focus();
                if (this.settings.devtron) {
                    this.webContents.executeJavaScript('Desktop.devtron.install()');
                }
            }
            this.systemEvents.emit('loadingFinished');
        });
        this.webContents.loadURL(`http://127.0.0.1:${port}/`);
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

        winston.loggers.options.transports = this.loggerTransports;
    }


    /**
     * Returns a new logger instance.
     * @param {string} entityName
     * @returns {Logger}
     */
    configureLogger(entityName = 'main') {
        const transports = [];
        winston.loggers.add(entityName, {});

        const logger = winston.loggers.get(entityName);
        if (entityName !== 'main') {
            logger.add(winston.transports.File, { name: entityName, filename: join(this.userDataDir, `${entityName}.log`) });
        }

        logger.filters.push((level, msg) => `[${entityName}] ${msg}`);
        logger._name = entityName;

        logger.getLoggerFor = (subEntityName) => {
            if (!winston.loggers.loggers[`${logger._name}__${subEntityName}`]) {
                winston.loggers.add(`${logger._name}__${subEntityName}`, {});
                const newLogger = winston.loggers.get(`${logger._name}__${subEntityName}`);
                /*newLogger.add(winston.transports.File, {
                    name: `${logger._name}__${subEntityName}`,
                    filename: join(this.userDataDir, `${entityName}.log`)
                });*/

                newLogger.filters.push((level, msg) => `[${logger._name}] [${subEntityName}] ${msg}`);
                newLogger.getLoggerFor = logger.getLoggerFor;
                return newLogger;
            }
            return winston.loggers.get(`${logger._name}__${subEntityName}`);
        }
    }
}

const appInstance = new App();
