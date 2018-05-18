import { app } from 'electron';
import path from 'path';
import {
    findNewestFileOrDirectory,
    removePaths,
    rimrafPromisfied,
    ioOperationWithRetries,
    batchIoOperationWithRetries
} from './storageMigration/ioHelper';


/**
 * Abstract file storage class.
 */
class AbsStorage {
    constructor(dir) {
        const appPath = app.getPath('userData');
        this.dir = dir;
        this.path = path.join(appPath, dir);
        this.entryPrefix = 'http_127.0.0.1_';
        this.pathGenerators = [];
        this.entryFilter = file => file.name.startsWith(this.entryPrefix);
    }
}

/**
 * Object representing local storage files.
 */
class LocalStorage extends AbsStorage {
    constructor() {
        super('Local Storage');
        const storagePath = port => `${this.entryPrefix}${port}.localstorage`;
        const storageJournalPath = port => `${this.entryPrefix}${port}.localstorage-journal`;
        this.targetStoragePath = 'meteor_desktop_0.localstorage';
        this.targetStorageJournalPath = 'meteor_desktop_0.localstorage-journal';
        this.pathGenerators = [storagePath, storageJournalPath];
        this.entryFilter =
                file =>
                    file.name.startsWith(this.entryPrefix) ||
                    file.name.startsWith(this.targetStoragePath);
    }
}

/**
 * @constructor
 */
export default class StorageMigration {
    constructor({ log, eventsBus }) {
        this.log = log;

        this.storages = [
            new LocalStorage(),
        ];

        eventsBus.on('beforeLocalServerInit', () => this.manage());

        this.portMatcher = /\.\d+_(\d+)/g;
    }

    /**
     * Runs the migrations.
     * @returns {Promise<[any]>}
     */
    manage() {
        const promises = [];
        this.storages.forEach((storage) => {
            promises.push(this.migrateSingleStorage(storage));
        });

        return Promise.all(promises);
    }

    /**
     * Removes unnecessary storage files.
     * @param {Array}  entries - list of files
     * @param {Object} storage
     */
    cleanupStorage(entries, storage) {
        const others = StorageMigration.listOthers(entries, storage);
        removePaths(others, rimrafPromisfied)
            .then(() => {
                this.log.debug('cleared old localStorage files');
            })
            .catch(() => {
                this.log.warn('failed clearing old localStorage files');
            });
    }

    /**
     * Runs the migration on a single storage object.
     * @param {Object} storage
     * @returns {Promise<any>}
     */
    migrateSingleStorage(storage) {
        return new Promise((resolve, reject) => {
            const { entries, newest } =
                findNewestFileOrDirectory(storage.path, storage.entryFilter);
            this.log.debug(`newest storage (${storage.dir}) entry is ${newest}`);

            // No files at all.
            if (newest === null) {
                resolve();
                return;
            }

            // If we already have the target file we are already after migration.
            if (entries.find(file => file.name.startsWith(storage.targetStoragePath))) {
                this.cleanupStorage(entries, storage);
                resolve();
                return;
            }

            const portMatcherResult = this.portMatcher.exec(newest);
            this.portMatcher.lastIndex = 0;
            const newestPort = portMatcherResult[1];

            let targetPaths = [storage.targetStoragePath, storage.targetStorageJournalPath];
            targetPaths = targetPaths.map(targetPath => path.join(storage.path, targetPath));

            const newestPaths =
                storage.pathGenerators.map(
                    pathGenerator => path.join(storage.path, pathGenerator(newestPort)));

            const pathPairs = newestPaths.map(
                (sourcePath, index) => [sourcePath, targetPaths[index]]);

            batchIoOperationWithRetries('move', undefined, undefined, ioOperationWithRetries, pathPairs)
                .then(() => {
                    this.cleanupStorage(entries, storage);
                    resolve();
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }

    /**
     * Deletes all local storage files that are not for the current and last port.
     *
     * @param {Array} files     - array with local storage files
     * @param {Object} storage
     */
    static listOthers(files, storage) {
        return files
            .filter(file => file.name.startsWith(storage.entryPrefix))
            .map(file => path.join(storage.path, file.name));
    }
}
