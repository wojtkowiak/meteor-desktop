/* eslint-disable consistent-return */
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import shell from 'shelljs';

/**
 * Exists
 * @param {string} pathToCheck
 * @returns {boolean}
 */
export function exists(pathToCheck) {
    try {
        fs.accessSync(pathToCheck);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Simple wrapper for shelljs.rm with additional retries in case of failure.
 * It is useful when something is concurrently reading the dir you want to remove.
 */
export function rmWithRetries(...args) {
    let retries = 0;
    return new Promise((resolve, reject) => {
        function rm(...rmArgs) {
            try {
                shell.config.fatal = true;
                shell.rm(...rmArgs);
                shell.config.reset();
                resolve();
            } catch (e) {
                retries += 1;
                if (retries < 5) {
                    setTimeout(() => {
                        rm(...rmArgs);
                    }, 100);
                } else {
                    shell.config.reset();
                    reject(e);
                }
            }
        }
        rm(...args);
    });
}

export function readDir(dir, callback) {
    if (!callback) {
        return new Promise((resolve, reject) => {
            readDir(dir, (err, data, stats) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({ data, stats });
                }
            });
        });
    }
    let list = [];
    let allStats = {};

    fs.readdir(dir, (err, files) => {
        if (err) {
            return callback(err);
        }
        let pending = files.length;
        if (!pending) {
            return callback(null, list, allStats);
        }
        files.forEach((file) => {
            const filePath = path.join(dir, file);
            fs.stat(filePath, (_err, stats) => {
                if (_err) {
                    return callback(_err);
                }
                if (stats.isDirectory()) {
                    readDir(filePath, (__err, res, _allStats) => {
                        if (__err) {
                            return callback(__err);
                        }
                        list = list.concat(res);
                        allStats = Object.assign(allStats, _allStats);
                        pending -= 1;
                        if (!pending) {
                            return callback(null, list, allStats);
                        }
                    });
                } else {
                    list.push(filePath);
                    allStats[filePath] = {
                        size: stats.size,
                        dates: [
                            stats.birthtime.getTime(),
                            stats.ctime.getTime(),
                            stats.mtime.getTime()
                        ]
                    };
                    pending -= 1;
                    if (!pending) {
                        return callback(null, list, allStats);
                    }
                }
            });
        });
    });
}

/**
 * Returns a file list from a directory.
 * @param {string} dir - dir path
 * @param {boolean} sort - whether to apply sort
 * @returns {Promise<Array>}
 */
export function getFileList(dir, sort = false) {
    return new Promise((resolve, reject) => {
        readDir(dir, (error, files) => {
            if (error) {
                reject(error);
                return;
            }
            // eslint-disable-next-line no-param-reassign
            let resultantFilesList;

            if (sort) {
                const stripLength = dir.length + 1;
                let pathsUnified = files.map((pth => pth.substr(stripLength).replace(/[\\/]/gm, '-')));
                const temporaryIndex = {};
                files.forEach((file, i) => {
                    temporaryIndex[pathsUnified[i]] = file;
                });
                pathsUnified = pathsUnified.sort();
                const filesSorted = [];
                pathsUnified.forEach((key) => {
                    filesSorted.push(temporaryIndex[key]);
                });
                resultantFilesList = filesSorted;
            } else {
                resultantFilesList = files;
            }
            resolve(resultantFilesList);
        });
    });
}

/**
 * Returns file's hash.
 * @param {string} file - file path
 * @param {boolean} returnFileContents - include file contents in the resultant object
 * @returns {Promise<Object>}
 */
export function readAndGetFileHash(file, returnFileContents = false) {
    return new Promise((resolve, reject) => {
        fs.readFile(file, (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            const hash = crypto.createHash('sha1');
            hash.update(data);
            const returnObject = { hash: hash.digest('hex') };
            if (returnFileContents) {
                returnObject.contents = data.toString('utf8');
            }
            resolve(returnObject);
        });
    });
}

/**
 * Calculates a hash from objects values in specified order.
 * @param {Array} orderOfKeys
 * @param {Object} hashSet
 * @param {Function} keyFilter
 * @returns {string}
 */
export function computeHashForHashesSet(orderOfKeys, hashSet, keyFilter = key => key) {
    const hash = crypto.createHash('sha1');
    const hashesJoined = orderOfKeys.reduce(
        // eslint-disable-next-line no-param-reassign
        (tmpHash, key) => (tmpHash += hashSet[keyFilter(key)], tmpHash), ''
    );
    hash.update(hashesJoined);
    return hash.digest('hex');
}


/**
 * Reads files from disk and computes hashes for them.
 * @param {Array} files - array with file paths
 * @returns {Promise<Object>}
 */
export function readAndHashFiles(files, fileFilter) {
    const fileHashes = {};
    const fileContents = {};
    const promises = [];

    function readSingleFile(file) {
        return new Promise((resolve, reject) => {
            readAndGetFileHash(file, file.endsWith('.js') && !file.endsWith('.test.js'))
                .then((result) => {
                    if (fileFilter) {
                        file = fileFilter(file);
                    }
                    fileHashes[file] = result.hash;
                    if (result.contents) {
                        fileContents[file] = result.contents;
                    }
                    resolve();
                })
                .catch(reject);
        });
    }

    files.forEach((file) => {
        promises.push(readSingleFile(file));
    });

    return new Promise((resolve, reject) => {
        Promise.all(promises)
            .then(() => {
                resolve({ files, fileContents, fileHashes });
            })
            .catch(reject);
    });
}

/**
 * Reads files from .desktop and computes a version hash.
 *
 * @param {string} dir - path
 * @param {Function} fileFilter
 * @returns {Promise<Object>}
 */
export function readFilesAndComputeHash(dir, fileFilter) {
    return new Promise((resolve, reject) => {
        getFileList(dir, true)
            .catch(reject)
            .then(files => readAndHashFiles(files, fileFilter))
            .catch(reject)
            .then((result) => {
                result.hash = computeHashForHashesSet(result.files, result.fileHashes, fileFilter);
                resolve(result);
            });
    });
}

/**
 * Symlink exists
 * @param {string} pathToCheck
 * @returns {boolean}
 */
export function symlinkExists(pathToCheck) {
    try {
        fs.readlinkSync(pathToCheck);
        return true;
    } catch (e) {
        return false;
    }
}


export default {
    getFileList, rmWithRetries, exists, readDir, readAndGetFileHash, computeHashForHashesSet,
    readAndHashFiles, readFilesAndComputeHash, symlinkExists
};
