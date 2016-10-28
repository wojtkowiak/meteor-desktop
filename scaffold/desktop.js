import process from 'process';
import { app, dialog } from 'electron';

/**
 * Entry point to your native desktop code.
 *
 * @class
 */
export default class Desktop {
    /**
     * @param {Object} log         - Winston logger instance
     * @param {Object} skeletonApp - reference to the skeleton app instance
     * @param {Object} appSettings - settings.json contents
     * @param {Object} eventsBus   - event emitter for listening or emitting events
     *                               shared across skeleton app and every module/plugin
     * @param {Object} modules     - references to all loaded modules
     * @param {Object} Module      - reference to the Module class
     * @constructor
     */
    constructor({ log, skeletonApp, appSettings, eventsBus, modules, Module }) {
        /**
         * You can delete unused var from the param destructuring.
         * Left them here just to emphasize what is passed.
         * You can also just have a one `config` param and do `Object.assign(this, config);`
         */
        const desktop = new Module('desktop');
        // Get the automatically predefined logger instance.
        this.log = log;

        // From Meteor use this by invoking Desktop.send('desktop', 'closeApp');
        desktop.on('closeApp', () => app.quit());

        // We need to handle gracefully potential problems.
        // Lets remove the default handler and replace it with ours.
        skeletonApp.removeUncaughtExceptionListener();

        process.on('uncaughtException', this.uncaughtExceptionHandler.bind(this));

        // Chrome problems should also be handled. The `windowOpened` event has a `window`
        // reference. This is the current Electron renderer process (Chrome) displaying your Meteor
        // app.
        eventsBus.on('windowOpened', (window) => {
            window.webContents.on('crashed', this.windowCrashedHandler.bind(this));
            window.on('unresponsive', this.windowUnresponsiveHandler.bind(this));
        });

        // Consider setting a crash reporter ->
        // https://github.com/electron/electron/blob/master/docs/api/crash-reporter.md
    }

    /**
     * Window crash handler.
     */
    windowCrashedHandler() {
        this.displayRestartDialog(
            'Application has crashed',
            'Do you want to restart it?',
        );
    }

    /**
     * Window's unresponsiveness handler.
     */
    windowUnresponsiveHandler() {
        this.displayRestartDialog(
            'Application is not responding',
            'Do you want to restart it?',
        );
    }

    /**
     * JS's uncaught exception handler.
     * @param {string} error - error message
     */
    uncaughtExceptionHandler(error) {
        // Consider sending a log somewhere, it is good be aware your users are having problems,
        // right?
        this.displayRestartDialog(
            'Application encountered an error',
            'Do you want to restart it?',
            error
        );
    }

    /**
     * Displays an error dialog with simple 'restart' or 'shutdown' choice.
     * @param {string} title   - title of the dialog
     * @param {string} message - message shown in the dialog
     * @param {string} details - additional details to be displayed
     */
    displayRestartDialog(title, message, details = null) {
        dialog.showMessageBox(
            { type: 'error', buttons: ['Restart', 'Shutdown'], title, message, detail: details },
            (response) => {
                if (response === 0) {
                    this.app.relaunch();
                }
                this.app.exit(0);
            }
        );
    }
}
