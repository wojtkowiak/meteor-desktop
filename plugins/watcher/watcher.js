/* eslint-disable no-console, consistent-return, no-param-reassign */
const fs = Npm.require('fs');
const path = Npm.require('path');
let Buffer = Npm.require('buffer');
const crypto = Npm.require('crypto');

if (Buffer.Buffer) {
    ({ Buffer } = Buffer);
}

function readdir(dir, callback) {
    if (!callback) {
        return new Promise((resolve, reject) => {
            readdir(dir, (err, data, stats) => {
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
                    readdir(filePath, (__err, res, _allStats) => {
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
                            stats.atime.getTime(),
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
 * Saves version hash to the version file.
 * @param {string} version
 * @param {string} versionFile
 */
function saveNewVersion(version, versionFile) {
    fs.writeFileSync(versionFile, JSON.stringify({
        version
    }, null, 2), 'UTF-8');
}

/**
 * Tries to read a settings.json file from desktop dir.
 *
 * @param {string} desktopPath - Path to the desktop dir.
 * @returns {Object}
 */
function getSettings(desktopPath) {
    let settings = {};
    try {
        settings = JSON.parse(
            fs.readFileSync(path.join(desktopPath, 'settings.json'), 'UTF-8')
        );
    } catch (e) {
        return {};
    }
    return settings;
}

/**
 * Returns a file list from a directory.
 * @param {string} dir - dir path
 * @returns {Promise<Array>}
 */
function getFileList(dir, sort = true) {
    return new Promise((resolve, reject) => {
        readdir(dir, (error, files) => {
            if (error) {
                reject(error);
                return;
            }
            let resultantFilesList;

            if (sort) {
                const stripLength = (dir.substr(0, 2) === './') ? dir.length - 1 : dir.length + 1;
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
 * Reads files from disk and computes hashes for them.
 * @param {Array} files - array with file paths
 * @returns {Promise<any>}
 */
function readAndHashFiles(files) {
    const fileHashes = {};
    const fileContents = {};
    const promises = [];

    function readSingleFile(file) {
        return new Promise((resolve, reject) => {
            fs.readFile(file, (err, data) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                const hash = crypto.createHash('sha1');
                hash.update(data);
                const bufferHash = hash.digest();
                fileHashes[file] = bufferHash.toString('hex');
                if (file.endsWith('.js') && !file.endsWith('.test.js')) {
                    fileContents[file] = data.toString('utf8');
                }
                resolve();
            });
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
 * @returns {Promise<Object>}
 */
function readFilesAndComputeDesktopHash(dir) {
    const desktopHash = crypto.createHash('sha1');

    return new Promise((resolve, reject) => {
        getFileList(dir)
            .catch(reject)
            .then(readAndHashFiles)
            .catch(reject)
            .then((result) => {
                const hash = result.files.reduce(
                    (tmpHash, file) => {
                        tmpHash += result.fileHashes[file];
                        return tmpHash;
                    }, ''
                );
                desktopHash.update(hash);
                result.hash = desktopHash.digest('hex');
                resolve(result);
            });
    });
}

// TODO: any better way of getting this path?
const rootPath = path.resolve(path.join(process.cwd(), '..', '..', '..', '..', '..'));
const desktopPath = path.resolve(path.join(rootPath, '.desktop'));

const settings = getSettings(desktopPath);
if (!('desktopHCP' in settings) || !settings.desktopHCP) {
    console.warn('[meteor-desktop] will not watch for changes is .desktop because there is no ' +
        '.desktop/settings.json or desktopHCP is set to false.  Remove this plugin if you do ' +
        'not want to use desktopHCP.');
} else if ('meteor-community:meteor-desktop-bundler' in Package) {
    const chokidar = Npm.require('chokidar');
    const versionFile = path.join(rootPath, 'version.desktop');

    const version =
        typeof Package['meteor-community:meteor-desktop-bundler'].METEOR_DESKTOP_VERSION === 'object' ?
            Package['meteor-community:meteor-desktop-bundler'].METEOR_DESKTOP_VERSION.version : null;

    if (version) {
        try {
            fs.readFileSync(versionFile, 'UTF-8');
        } catch (e) {
            throw new Error('[meteor-desktop] there is no version.desktop file. Are you sure you ' +
                'have meteor-community:meteor-desktop-bundler package added to your project?');
        }

        readFilesAndComputeDesktopHash(desktopPath)
            .then((result) => {
                const currentVersion = `${result.hash}_dev`;
                if (currentVersion !== version) {
                    // TODO: something meteor'ish to print to stdout?
                    console.info('[meteor-desktop] Initial .desktop version inconsistency found. Files ' +
                        'have changed during the build, triggering desktop rebuild.');
                    setTimeout(() => saveNewVersion(currentVersion, versionFile), 3000);
                } else {
                    const watcher = chokidar.watch(desktopPath, {
                        persistent: true,
                        ignored: /tmp___/,
                        ignoreInitial: true
                    });

                    let timeout = null;

                    watcher
                        .on('all', (event, filePath) => {
                            if (timeout) {
                                clearTimeout(timeout);
                            }
                            // Simple 2s debounce.
                            timeout = setTimeout(() => {
                                console.log(`[meteor-desktop] ${filePath} have been changed, triggering` +
                                    ' desktop rebuild.');
                                readFilesAndComputeDesktopHash(desktopPath)
                                    .then((newResult) => {
                                        saveNewVersion(`${newResult.hash}_dev`, versionFile);
                                    })
                                    .catch((e) => { throw new Error(`[meteor-desktop] failed to compute .desktop hash: ${e}`); });
                            }, 2000);
                        });
                    console.log(`[meteor-desktop] watching ${desktopPath} for changes.`);
                }
            })
            .catch((e) => { throw new Error(`[meteor-desktop] failed to compute .desktop hash: ${e}`); });
    } else {
        console.info('[meteor-desktop] .desktop HCP will not work because either web.cordova ' +
            'architecture is missing or the bundler had troubles with creating desktop.asar. Be' +
            ' sure that you are running mobile target or with --mobile-server.');
    }
} else {
    throw new Error('[meteor-desktop] bundler plugin was not detected. Are you sure you have ' +
        'meteor-community:meteor-desktop-bundler package added to your project?');
}
