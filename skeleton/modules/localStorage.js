import shelljs from 'shelljs';
import { app } from 'electron';
import fs from 'fs-plus';
import path from 'path';

/**
 * Utility to manage Chrome's local storage files.
 * Its purpose is to preserve local storage data even though every time the app starts a
 * different port is used and a new blank local storage file is created.
 * It tries to achieve that just by manipulating the files (copying/renaming/deleting).
 *
 * !This is a temporary solution before architecture change in 1.0!
 *
 * @constructor
 */
export default class LocalStorage {

    constructor({ log, eventsBus, appSettings }) {
        const appPath = app.getPath('userData');

        this.log = log;
        this.localStoragePath = path.join(appPath, 'Local Storage');
        this.filePrefix = 'http_127.0.0.1_';

        this.storagePath = port =>
            path.join(this.localStoragePath, `${this.filePrefix}${port}.localstorage`);
        this.storageJournalPath = port =>
            path.join(this.localStoragePath, `${this.filePrefix}${port}.localstorage-journal`);

        if (appSettings.experimentalLocalStorage) {
            this.log.info('experimental local storage enabled');
            eventsBus.on('beforeLoadUrl', (port, lastPort = null) => {
                this.prepare(port, lastPort);
            });
        }
    }

    /**
     * Traverses the local storage directory looking for the last modified local storage file.
     *
     * @returns {{latestPort: number, files: Array}}
     */
    findLatestLocalStorageFile() {
        let maxMTime = 0;
        let latestPort = 0;
        let files = [];

        if (fs.existsSync(this.localStoragePath)) {
            files = shelljs.ls('-l', this.localStoragePath);

            files.forEach((file) => {
                if (file.name.startsWith(this.filePrefix)) {
                    // TODO: change this to regex
                    const localPort = parseInt(file.name.substr(this.filePrefix.length, 4), 10);

                    if (file.mtime.getTime() > maxMTime) {
                        latestPort = localPort;
                        maxMTime = file.mtime.getTime();
                    }
                }
            });
        }

        return { latestPort, files };
    }

    /**
     * Renames the newest local storage in a way to make Chrome load it for the current url.
     *
     * @param {number} port     - port on which the meteor app is going to be served
     * @param {number} lastPort - port on which the meteor app was served previously
     */
    prepare(port, lastPort = null) {
        const { latestPort, files } = this.findLatestLocalStorageFile();

        if (latestPort === 0) return;

        if (latestPort !== port) {
            const involvedFiles = [
                this.storagePath(port),
                this.storageJournalPath(port),
                this.storagePath(latestPort),
                this.storageJournalPath(latestPort)
            ];

            // Delete the files for the current port if they exist.
            if (fs.existsSync(involvedFiles[0])) {
                try {
                    fs.unlinkSync(involvedFiles[0]);
                    fs.unlinkSync(involvedFiles[1]);
                } catch (e) {
                    this.log.error('could not delete old local storage file, aborting, the' +
                        ' storage may be outdated');
                    return;
                }
            }

            // When we have information about last port this is probably the case when HCP
            // refresh is being made. In this case it is safer to copy instead of moving as the
            // files might be in use.
            const operation = lastPort !== null ? 'cp' : 'mv';

            shelljs[operation](involvedFiles[2], involvedFiles[0]);
            shelljs[operation](involvedFiles[3], involvedFiles[1]);

            // Try to cleanup.
            if (lastPort !== null) {
                try {
                    fs.unlinkSync(involvedFiles[2]);
                    fs.unlinkSync(involvedFiles[3]);
                } catch (e) {
                    // No harm...
                }
            }
            this.log.verbose(`storage from port ${latestPort} migrated to ${port}`);
        }

        this.deleteOthers(port, lastPort, files);
    }

    /**
     * Deletes all local storage files that are not for the current and last port.
     *
     * @param {number} port     - port on which the meteor app is going to be served
     * @param {number} lastPort - port on which the meteor app was served previously
     * @param {Array} files     - array with local storage files
     */
    deleteOthers(port, lastPort, files) {
        files.forEach((file) => {
            if (file.name.startsWith(this.filePrefix) && !~file.name.indexOf(port) &&
                (lastPort === null || (lastPort !== null && !~file.name.indexOf(lastPort)))
            ) {
                const filePath = path.join(this.localStoragePath, file.name);
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (e) {
                        // No harm...
                    }
                }
            }
        });
    }
}
