/* eslint-disable import/no-unresolved */
/* eslint-disable global-require */

import electron from 'electron';
import { EventEmitter as Events } from 'events';
import path from 'path';
import fs from 'fs-plus';
import os from 'os';
import shell from 'shelljs';
import assignIn from 'lodash/assignIn';
import { spawnSync } from 'child_process';
import winston from 'winston';
import Module from './modules/module.js';
import LoggerManager from './loggerManager';
import DesktopPathResolver from './desktopPathResolver';

const { app, BrowserWindow, dialog, autoUpdater } = electron;
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

        this.loggerManager = new LoggerManager(this);
        this.l = this.loggerManager.getMainLogger();

        this.l.info('app data dir is:', this.userDataDir);

        this.settings = {
            devTools: false
        };

        this.desktopPath = DesktopPathResolver.resolveDesktopPath(this.userDataDir, this.l);
        this.loadSettings();

        if (this.handleSquirrelEvents()) {
            app.quit();
            return;
        }

        if ('builderOptions' in this.settings && this.settings.builderOptions.appId) {
            app.setAppUserModelId(this.settings.builderOptions.appId);
        }

        // System events emitter.
        this.systemEvents = new Events();

        this.desktop = null;
        this.app = app;
        this.window = null;
        this.windowAlreadyLoaded = false;
        this.autoUpdater = null;
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
            const desktopShortcutPath = path.join(homeDirectory, 'Desktop', exeName + '.lnk');
            if (fs.existsSync(desktopShortcutPath)) {
                this.createShortcuts();
            }
        } else {
            this.createShortcuts();
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

        this.setUpAutoUpdater();

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
            this.l.warn('could not load desktop.js', e);
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

    setUpAutoUpdater() {
        if (this.settings.autoUpdateFeedUrl && this.settings.autoUpdateFeedUrl.trim() !== '') {
            const version = app.getVersion();
            let platform = '';
            if (this.os.isWindows) {
                platform = os.arch() === 'ia32' ? 'win32' : 'win64';
            }
            if (this.os.isOsx) {
                platform = os.platform() + '_' + os.arch();
            }
            let feed = this.settings.autoUpdateFeedUrl;
            feed = feed.replace(':version', version);
            feed = feed.replace(':platform', platform);
            this.l.info(feed);

            autoUpdater.on('error', (err) => {
                this.l.error('autoUpdater reported an error:', err);
            });
            autoUpdater.on('checking-for-update', () => {
                this.l.info('autoUpdater is checking for updates');
            });

            autoUpdater.on('update-available', () => {
                this.l.info('autoUpdater reported an update is available');
            });

            autoUpdater.on('update-not-available', () => {
                this.l.info('autoUpdater reported an update is not available');
            });

            autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName, releaseDate, updateURL) => {
                this.l.info('autoUpdater reported an update was downloaded with version:', releaseName);
                this.systemEvents.emit('autoUpdaterUpdateDownloaded', releaseNotes, releaseName, releaseDate, updateURL);
            });
            autoUpdater.setFeedURL(feed, this.settings.autoUpdateFeedHeaders ? autoUpdateFeedHeaders : undefined);
            autoUpdater.checkForUpdates();
            this.autoUpdater = autoUpdater;
        }
    }

    /**
     * On server restart point chrome to the new port.
     * @param {number} port - port on which the app is served
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
                    this.loggerManager.configureLogger(plugin);
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
                this.loggerManager.configureLogger(moduleName);
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
                    this.loggerManager.configureLogger(moduleName);
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
     * @param {number} code - error code from local server
     */
    onStartupFailed(code) {
        this.systemEvents.emit('startupFailed');
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
}

const appInstance = new App();
