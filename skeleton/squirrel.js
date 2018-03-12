/* eslint-disable import/no-dynamic-require */
import path from 'path';
import { spawnSync } from 'child_process';
import fs from 'fs-plus';
import os from 'os';
import electron from 'electron';

const { app, autoUpdater } = electron;

/**
 * Basic Squirrel.Mac and Squirrel.Windows support.
 * @class
 */
export default class Squirrel {
    /**
     * Runs Update.exe from Squirrel with provided arguments.
     * @param {Array} args - Update.exe arguments
     */
    static spawnUpdate(args) {
        const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
        spawnSync(updateExe, args);
    }

    /**
     * Removes application shortcut.
     */
    static removeShortcuts() {
        const exeName = path.basename(process.execPath);
        Squirrel.spawnUpdate(['--removeShortcut', exeName]);
    }

    /**
     * Creates application shortcut.
     */
    static createShortcuts() {
        const exeName = path.basename(process.execPath);
        Squirrel.spawnUpdate(['--createShortcut', exeName]);
    }

    /**
     * Updates application shortcut.
     */
    static updateShortcuts() {
        const homeDirectory = fs.getHomeDirectory();
        if (homeDirectory) {
            const exeName = path.basename(process.execPath, '.exe');
            const desktopShortcutPath = path.join(homeDirectory, 'Desktop', `${exeName}.lnk`);
            if (fs.existsSync(desktopShortcutPath)) {
                Squirrel.createShortcuts();
            }
        } else {
            Squirrel.createShortcuts();
        }
    }

    /**
     * Tries to load user defined event handling class.
     * @param {string} desktopPath - path to desktop.asar
     * @returns {{}|SquirrelEvents}
     */
    static loadCustomHooks(desktopPath) {
        let hooks;
        try {
            const HooksClass = require(path.join(desktopPath, 'squirrelEvents.js')).default; // eslint-disable-line global-require
            hooks = new HooksClass(this);
        } catch (e) {
            hooks = {};
        }
        return hooks;
    }

    /**
     * Handles installation events passed by Squirrel.
     * @param {string} desktopPath - path to desktop.asar
     * @returns {boolean}
     */
    static handleSquirrelEvents(desktopPath) {
        const hooks = Squirrel.loadCustomHooks(desktopPath);

        // Events are generated only for Windows.
        if (process.platform !== 'win32') {
            return false;
        }

        const squirrelCommand = process.argv[1];
        if (!squirrelCommand || squirrelCommand.substr(0, '--squirrel'.length) !== '--squirrel') {
            return false;
        }

        switch (squirrelCommand) {
            case '--squirrel-install':
                if (hooks.install) {
                    hooks.install();
                }
                break;
            case '--squirrel-firstrun':
                if (hooks.firstRun) {
                    hooks.firstRun();
                }
                return false;
            case '--squirrel-updated':
                if (hooks.updated) {
                    hooks.updated();
                }
                break;
            case '--squirrel-uninstall':
                if (hooks.uninstall) {
                    hooks.uninstall();
                }
                break;
            default:
                return false;
        }

        return true;
    }

    /**
     * Sets the correct feed url to the auto updater and by default runs an update check.
     * @param {App} context - reference to the App
     */
    static setUpAutoUpdater(context) {
        if (context.settings.autoUpdateFeedUrl && context.settings.autoUpdateFeedUrl.trim() !== '') {
            const version = app.getVersion();
            let platform = '';
            if (context.os.isWindows) {
                platform = os.arch() === 'ia32' ? 'win32' : 'win64';
            }
            if (context.os.isOsx) {
                platform = `${os.platform()}_${os.arch()}`;
            }
            let feed = context.settings.autoUpdateFeedUrl;
            feed = feed.replace(':version', version);
            feed = feed.replace(':platform', platform);
            context.l.info(`seting autoupdate feed to url: ${feed}`);

            autoUpdater.on('error', (err) => {
                context.l.error('autoUpdater reported an error:', err);
            });
            autoUpdater.on('checking-for-update', () => {
                context.l.info('autoUpdater is checking for updates');
            });

            autoUpdater.on('update-available', () => {
                context.l.info('autoUpdater reported an update is available');
            });

            autoUpdater.on('update-not-available', () => {
                context.l.info('autoUpdater reported an update is not available');
            });

            autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
                context.l.info('autoUpdater reported an update was downloaded with version:',
                    releaseName);
            });

            if (process.platform === 'darwin' && !context.isProduction()) {
                context.l.info('disabling autoUpdate because on Mac in development build it' +
                    ' would not work anyway (app needs to be signed)');
                return;
            }

            autoUpdater.setFeedURL(
                feed,
                context.settings.autoUpdateFeedHeaders ?
                    context.settings.autoUpdateFeedHeaders : undefined
            );
            // Check for updates unless the developer wants to do it himself.
            if (!context.settings.autoUpdateCheckOnStart) {
                autoUpdater.checkForUpdates();
            }
        }
    }
}

