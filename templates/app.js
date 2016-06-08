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

import Module from './modules/module.js';

class App {

    constructor() {
        this.l = new winston.Logger({
            level: 'debug',
            transports: [
                new (winston.transports.Console)(),
                new (winston.transports.File)({ filename: join(__dirname, 'run.log') })
            ]
        });
        this.desktop = null;
        this.app = app;
        this.window = null;
        this.webContents = null;

        this.settings = {
            devTools: false
        };
        this.modules = {};
        this.systemEvents = new Events();
        this.loadedAlready = false;

        this.os = {
            isWindows: (process.platform === 'win32'),
            isLinux: (process.platform === 'linux'),
            isOsx: (process.platform === 'darwin')
        };

        //this.catchUncaughtExceptions();
        this.loadSettings();

        electronDebug({
            showDevTools: true,
            enabled: (this.settings.devTools !== undefined) ? this.settings.devTools : true
        });

        if (!('window' in this.settings)) {
            this.settings.window = {};
        }

        this.mergeOsSpecificWindowSettings();

        if ('icon' in this.settings.window) {
            this.settings.window.icon = join(__dirname, 'assets', this.settings.window.icon);
        }

        this.app.on('ready', this.onReady.bind(this));
        this.app.on('window-all-closed', () => this.app.quit());
    }

    onStartupFailed(code) {
        this.systemEvents.emit('startupFailed');
        dialog.showErrorBox('Startup error', 'Could not initialize app. Please contact' +
            ` your support. Error code: ${code}`);
        this.app.quit();
    }

    onServerReady(port) {
        const windowSettings = {
            width: 800, height: 600,
            webPreferences: {
                nodeIntegration: false, // node integration must to be off
                preload: join(__dirname, 'preload.js')
            },
            show: false
        };

        assignIn(windowSettings, this.settings.window);

        this.window = new BrowserWindow(windowSettings);

        this.webContents = this.window.webContents;

        this.systemEvents.emit('windowOpened', this.window);

        // Here we are catching reloads triggered by hot code push.
        this.webContents.on('will-navigate', event => {
            // We need to block it.
            event.preventDefault();
            this.systemEvents.emit(
                'beforeReload', this.modules.autoupdate.getPendingVersion());

            // Firing reset routine.
            this.modules.autoupdate.onReset();

            // Reinitialize the local server.
            localServer.init(
                this.modules.autoupdate.getDirectory(),
                this.modules.autoupdate.getParentDirectory(),
                true
            );
        });

        // The app was loaded.
        this.webContents.on('did-stop-loading', () => {
            if (!this.loadedAlready) {
                this.loadedAlready = true;
                this.systemEvents.emit('beforeLoadingFinished');

                if (this.settings.window.fullscreen) {
                    this.window.setFullScreen(true);
                }
                this.window.setKiosk(
                    this.settings.window.kiosk !== undefined ?
                        this.settings.window.kiosk : false
                );
                this.window.setAlwaysOnTop(
                    this.settings.window.alwaysOnTop !== undefined ?
                        this.settings.window.alwaysOnTop : false
                );
                this.window.show();
                this.window.focus();
            }

            this.systemEvents.emit('loadingFinished');
        });
        this.webContents.loadURL(`http://127.0.0.1:${port}/`);
    }

    onReady() {
        this.l.info('ready fired');

        this.loadPlugins();
        this.systemEvents.emit('beforeModulesLoad');
        this.loadModules();

        this.systemEvents.emit('beforeDesktopLoaded');

        try {
            this.desktop = require('./desktop.js')(
                this.l,
                this.app,
                this.settings,
                this.systemEvents,
                this.modules
            );
            this.systemEvents.emit('desktopLoaded', this.desktop);
            this.l.debug('desktop loaded');
        } catch (e) {
            this.l.warn('could not load desktop.js');
        }

        let localServer;

        localServer = this.modules.localServer;

        localServer.setCallbacks(
            this.onStartupFailed.bind(this),
            this.onServerReady.bind(this),
            this.onServerRestarted.bind(this)
        );

        localServer.init(
            this.modules.autoupdate.getDirectory(),
            this.modules.autoupdate.getParentDirectory()
        );
    }

    onServerRestarted(port) {
        this.webContents.loadURL(`http://127.0.0.1:${port}/`);
    }

    loadPlugins() {
        if ('plugins' in this.settings) {
            Object.keys(this.settings.plugins).forEach(plugin => {
                this.l.debug(`loading plugin: ${plugin}`);
                this.modules[plugin] = require(plugin);
                const Plugin = this.modules[plugin];
                this.modules[plugin] = new Plugin(
                    this.l,
                    this.app,
                    this.settings,
                    this.systemEvents,
                    this.modules,
                    this.settings.plugins[plugin],
                    Module``
                );
            });
        }
    }

    loadModules() {
        let moduleName;

        // Load internal modules.
        shell.ls(join(__dirname, 'modules', '*.js')).forEach(file => {
            if (!~file.indexOf('module.js')) {
                moduleName = path.parse(file).name;
                this.l.debug(`loading module: ${file}`);
                this.modules[moduleName] = require(file);
                const InternalModule = this.modules[moduleName];
                this.modules[moduleName] = new InternalModule(
                    this.l,
                    this.app,
                    this.settings,
                    this.systemEvents,
                    this.modules
                );
            }
        });

        shell.ls('-d', join(__dirname, 'modules', '*')).forEach(file => {
            try {
                if (fs.accessSync(path.join(file, 'index.js'), fs.R_OK)) {
                    moduleName = path.parse(file).name;
                    this.l.debug(`loading module: ${file} => ${moduleName}`);
                    let settings = {};
                    try {
                        let moduleJson = {};
                        moduleJson = JSON.parse(
                            fs.readFileSync(path.join(file, 'module.json'), 'UTF-8')
                        );
                        if ('settings' in moduleJson) {
                            settings = moduleJson.settings;
                        }
                    } catch (e) {
                        this.l.warn(`could not load ${path.join(file, 'module.json')}`);
                    }
                    this.modules[moduleName] = require(path.join(file, 'index.js'));
                    const AppModule = this.modules[moduleName];
                    this.modules[moduleName] = new AppModule(
                        this.l,
                        this.app,
                        this.settings,
                        this.systemEvents,
                        this.modules,
                        settings);
                }
            } catch (e) {
            }
        });
    }

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

    loadSettings() {
        try {
            this.settings = JSON.parse(fs.readFileSync(join(__dirname, 'settings.json'), 'UTF-8'));
        } catch (e) {
            dialog.showErrorBox('Application', 'Could not read settings.json. Please reinstall' +
                ' this application.');
            if (this.app && this.app.quit) {
                this.app.quit();
            }
            process.exit(1);
        }
    }

    catchUncaughtExceptions() {
        process.on('uncaughtException', error => {
            this.l.error(error);
            try {
                this.systemEvents.emit('unhandledException');
            } catch (e) {
                // Empty catch block... nasty...
            }
            try {
                this.window.close();
            } catch (e) {
                // Empty catch block... nasty...
            }
            this.app.quit();
        });
    }
}

const appInstance = new App();
