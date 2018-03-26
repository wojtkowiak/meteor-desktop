/**
 This is a slightly modified JS port of hot code push android client from here:
 https://github.com/meteor/cordova-plugin-meteor-webapp

 The MIT License (MIT)

 Copyright (c) 2015 Meteor Development Group

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.

 This file is based on:
 /cordova-plugin-meteor-webapp/blob/master/src/android/AssetBundleManager.java

 */

import path from 'path';
import fs from 'fs-plus';
import rimraf from 'rimraf';
import originalFs from 'original-fs';
import url from 'url';
import request from 'request';
import shell from 'shelljs';

import AssetBundle from './assetBundle';
import AssetBundleDownloader from './assetBundleDownloader';
import AssetManifest from './assetManifest';
import utils from './utils';

const { rimrafWithRetries } = utils;

class AssetBundleManager {
    /**
     * @param {object}      log                - Winston reference.
     * @param {object}      configuration      - Configuration object.
     * @param {AssetBundle} initialAssetBundle - Parent asset bundle.
     * @param {string}      versionsDirectory  - Path to versions dir.
     * @param {string}      desktopBundlePath  - Path to dir with desktop bundles.
     * @param {Object}      appSettings        - Settings from desktop.json.
     * @constructor
     */
    constructor(
        log, configuration, initialAssetBundle, versionsDirectory, desktopBundlePath, appSettings
    ) {
        this.log = log.getLoggerFor('AssetBundleManager');

        this.appSettings = appSettings;
        this.configuration = configuration;
        this.initialAssetBundle = initialAssetBundle;

        this.versionsDirectory = versionsDirectory;
        this.desktopBundlePath = desktopBundlePath;

        this.downloadDirectory = path.join(versionsDirectory, 'Downloading');
        this.partialDownloadDirectory = path.join(versionsDirectory, 'PartialDownload');

        this.downloadedAssetBundlesByVersion = {};
        this.partiallyDownloadedAssetBundle = null;

        this.callback = null;
        this.assetBundleDownloader = null;

        this.httpClient = request;

        this.loadDownloadedAssetBundles();
    }

    /**
     * Callback setter.
     *
     * @param {Object} callback
     */
    setCallback(callback) {
        this.callback = callback;
    }

    /**
     * Returns a bundle searched by version.
     * @param {string} version - Version to get.
     * @returns {AssetBundle|null}
     */
    downloadedAssetBundleWithVersion(version) {
        if (version in this.downloadedAssetBundlesByVersion) {
            return this.downloadedAssetBundlesByVersion[version];
        }
        return null;
    }

    /**
     * Tries to download the desktop version manifest.
     * @param {string} desktopVersionUrl - The url to the version.desktop.json
     * @param {function} callback - Function to run after.
     */
    getDesktopVersion(desktopVersionUrl, callback) {
        if ('desktopHCP' in this.appSettings && this.appSettings.desktopHCP) {
            this.httpClient(desktopVersionUrl, (error, response, body) => {
                let desktopVersion = {};
                if (error) {
                    this.didFail(`error downloading version.desktop.json: ${error}`);
                    return;
                }
                if (response.statusCode !== 200) {
                    this.didFail(
                        `non-success status code ${response.statusCode} for version.desktop.json`
                    );
                    return;
                }

                try {
                    desktopVersion = JSON.parse(body);
                } catch (e) {
                    this.didFail(`error parsing version.desktop.json: ${e.message}`);
                    return;
                }
                callback(desktopVersion);
            });
        } else {
            callback(null);
        }
    }

    /**
     * Starts checking for available update.
     *
     * @param {string} baseUrl - Url of meteor server.
     */
    checkForUpdates(baseUrl) {
        let manifest;
        const manifestUrl = url.resolve(baseUrl, 'manifest.json');
        const desktopVersionUrl = url.resolve(baseUrl, 'version.desktop.json?meteor_dont_serve_index=true');

        this.log.info(`trying to query ${manifestUrl}`);

        this.httpClient(manifestUrl, (error, response, body) => {
            if (error) {
                this.didFail(`error downloading asset manifest: ${error}`);
                return;
            }
            if (response.statusCode !== 200) {
                this.didFail(
                    `non-success status code ${response.statusCode} for asset manifest`
                );
                return;
            }

            try {
                manifest = new AssetManifest(this.log, body);
            } catch (e) {
                this.didFail(e.message);
                return;
            }

            const { version } = manifest;

            this.log.debug(`downloaded asset manifest for version: ${version}`);

            if (
                this.assetBundleDownloader !== null &&
                this.assetBundleDownloader.getAssetBundle().getVersion() === version
            ) {
                this.log.info(`already downloading asset bundle version: ${version}`);
                return;
            }

            // At this point we will check if we need to download the desktop version information.
            this.getDesktopVersion(desktopVersionUrl, (desktopVersion) => {
                // Give the callback a chance to decide whether the version should be downloaded.
                if (
                    this.callback !== null &&
                    !this.callback.shouldDownloadBundleForManifest(manifest, desktopVersion)
                ) {
                    return;
                }

                // Cancel download in progress if there is one.
                if (this.assetBundleDownloader !== null) {
                    this.assetBundleDownloader.cancel();
                }
                this.assetBundleDownloader = null;

                // There is no need to re-download the initial version.
                if (this.initialAssetBundle.getVersion() === version) {
                    this.log.debug('No redownload of initial version.');
                    this.didFinishDownloadingAssetBundle(this.initialAssetBundle, true);
                    return;
                }

                // If there is a previously downloaded asset bundle with the requested
                // version, use that.
                if (version in this.downloadedAssetBundlesByVersion) {
                    const downloadedAssetBundle = this.downloadedAssetBundlesByVersion[version];
                    downloadedAssetBundle.desktopVersion = desktopVersion;
                    if (downloadedAssetBundle !== null) {
                        this.didFinishDownloadingAssetBundle(downloadedAssetBundle);
                        return;
                    }
                }

                // Else, get ready to download the new asset bundle
                this.moveExistingDownloadDirectoryIfNeeded();

                // Create download directory
                if (!this.makeDownloadDirectory()) {
                    this.didFail('could not create download directory');
                    return;
                }

                // Copy downloaded asset manifest to file.
                try {
                    fs.writeFileSync(path.join(this.downloadDirectory, 'program.json'), body);
                } catch (e) {
                    this.didFail(e.message);
                    return;
                }
                this.log.debug('manifest copied to new Download dir');

                let assetBundle = null;
                try {
                    assetBundle = new AssetBundle(
                        this.log,
                        this.downloadDirectory,
                        manifest,
                        this.initialAssetBundle,
                        desktopVersion === null ? undefined : desktopVersion
                    );
                } catch (e) {
                    this.didFail(e.message);
                    return;
                }

                this.downloadAssetBundle(assetBundle, baseUrl);
            });
        });
    }

    /**
     * Removes unnecessary versions.
     *
     * @param {AssetBundle} assetBundleToKeep
     * @returns {Promise}
     */
    removeAllDownloadedAssetBundlesExceptForVersion(assetBundleToKeep) {
        const desktopVersionToKeep = assetBundleToKeep.desktopVersion;
        const promises = [];
        Object.keys(this.downloadedAssetBundlesByVersion).forEach(
            (assetVersion) => {
                const assetBundle = this.downloadedAssetBundlesByVersion[assetVersion];
                const version = assetBundle.getVersion();
                if (version !== assetBundleToKeep.getVersion()) {
                    const { desktopVersion } = assetBundle;
                    if (desktopVersion.version && desktopVersionToKeep.version &&
                        desktopVersion.version !== desktopVersionToKeep.version) {
                        this.log.info(`pruned old ${desktopVersion.version}_desktop.asar`);

                        try {
                            originalFs.unlinkSync(
                                path.join(this.desktopBundlePath,
                                    `${desktopVersion.version}_desktop.asar`)
                            );
                        } catch (e) {
                            // Theoretically no harm if we could not delete it...
                        }
                    }
                    // Using rimraf specifically instead of shelljs.rm because despite using
                    // process.noAsar shelljs tried to remove files inside asar instead of just
                    // deleting the archive. `del` also could not delete asar archive. Rimraf is ok
                    // because it accepts custom fs object.
                    promises.push(
                        // This will be an array of Promises that always are resolved.
                        new Promise((resolve) => {
                            const pathToDelete = path.join(this.versionsDirectory, version);
                            rimrafWithRetries(pathToDelete, originalFs)
                                .then(() => {
                                    this.log.info(`pruned old version dir ${version}`);
                                    resolve({ pathToDelete, state: true });
                                }).catch((e) => {
                                    this.log.error(
                                        `error while pruning old version dir ${version}`
                                    );
                                    resolve({ pathToDelete, state: false, reason: e });
                                });
                        })
                    );
                    delete this.downloadedAssetBundlesByVersion[version];
                }
            }
        );
        return Promise.all(promises);
    }

    /**
     * Creates Download directory.
     *
     * @returns {boolean}
     * @private
     */
    makeDownloadDirectory() {
        // Make shellJs throw on failure.
        shell.config.fatal = true;
        try {
            if (!fs.existsSync(this.downloadDirectory)) {
                this.log.info('created download dir.');
                shell.mkdir(this.downloadDirectory);
            }
            return true;
        } catch (e) {
            this.log.debug(`creating download dir failed: ${e.message}`);
        } finally {
            shell.config.fatal = false;
        }
        return false;
    }

    /**
     * Loads all downloaded asset bundles.
     *
     * @private
     */
    loadDownloadedAssetBundles() {
        shell.ls(this.versionsDirectory).forEach((file) => {
            const directory = path.join(this.versionsDirectory, file);
            if (this.downloadDirectory !== directory
                && this.partialDownloadDirectory !== directory
                && originalFs.lstatSync(directory).isDirectory()
            ) {
                try {
                    const assetBundle = new AssetBundle(
                        this.log,
                        directory,
                        undefined,
                        this.initialAssetBundle
                    );
                    this.log.info(`got version: ${assetBundle.getVersion()} in ${file}`);
                    this.downloadedAssetBundlesByVersion[assetBundle.getVersion()] = assetBundle;
                } catch (e) {
                    this.log.info(`broken version in directory: ${directory}`);
                }
            }
        });
    }

    /**
     * Failure handler.
     *
     * @param {string} cause - Error message.
     * @private
     */
    didFail(cause) {
        this.assetBundleDownloader = null;
        this.log.debug(`fail: ${cause}`);

        if (this.callback !== null) {
            this.callback.onError(cause);
        }
    }

    /**
     * Success handler.
     *
     * @param {AssetBundle} assetBundle      - Asset bundle which was downloaded.
     * @param {boolean} isInitialAssetBundle - whether this is the initial asset bundle
     * @private
     */
    didFinishDownloadingAssetBundle(assetBundle, isInitialAssetBundle = false) {
        this.assetBundleDownloader = null;

        this.handleDesktopBundle(assetBundle, isInitialAssetBundle);

        if (this.callback !== null) {
            this.callback.onFinishedDownloadingAssetBundle(assetBundle);
        }
    }

    /**
     * @param {AssetBundle} assetBundle - Asset bundle which was downloaded.
     * @param {boolean} isInitialAssetBundle - whether this is the initial asset bundle
     * @private
     */
    handleDesktopBundle(assetBundle, isInitialAssetBundle = false) {
        if (assetBundle.desktopVersion.version) {
            // We will not be able to write into meteor.asar. Avoid that. It is not necessary for
            // initial bundle.
            if (!isInitialAssetBundle) {
                assetBundle.writeDesktopVersion();
            } else {
                this.log.debug('skipping writing desktop version into' +
                    ' initial version');
            }
            // If there is a new version of desktop.asar copy it to desktop bundle path.
            const desktopPath = path.join(
                this.desktopBundlePath,
                `${assetBundle.desktopVersion.version}_desktop.asar`
            );

            if (!fs.existsSync(desktopPath)) {
                if (isInitialAssetBundle) {
                    const initialDesktopPath = path.resolve(path.join(__dirname, '..', '..', '..', 'desktop.asar'));
                    originalFs.writeFileSync(
                        desktopPath, originalFs.readFileSync(initialDesktopPath)
                    );
                    this.log.debug('copied initial desktop.asar to', desktopPath);
                } else {
                    assetBundle.getOwnAssets().some((asset) => {
                        if (~asset.filePath.indexOf('desktop.asar')) {
                            // TODO: need more efficient way of copying asar archive
                            originalFs.writeFileSync(
                                desktopPath, originalFs.readFileSync(asset.getFile())
                            );
                            this.log.debug('copied desktop.asar to', desktopPath);
                            return true;
                        }
                        return false;
                    });
                }
            } else {
                this.log.debug('skipping copying desktop.asar because the version is already' +
                    ' downloaded');
            }
        }
    }

    /**
     * Searches for a cached asset in all available bundles.
     *
     * @param {Asset} asset - Asset we are searching for.
     * @returns {Asset|null}
     * @private
     */
    cachedAssetForAsset(asset) {
        const bundles = Object.keys(this.downloadedAssetBundlesByVersion).reduce(
            (arr, key) => {
                arr.push(this.downloadedAssetBundlesByVersion[key]);
                return arr;
            },
            []
        );

        let cachedAsset;
        const assetFound = bundles.some((assetBundle) => {
            cachedAsset = assetBundle.cachedAssetForUrlPath(asset.urlPath, asset.hash);
            return cachedAsset;
        });
        if (assetFound) {
            return cachedAsset;
        }

        if (this.partiallyDownloadedAssetBundle !== null) {
            cachedAsset =
                this.partiallyDownloadedAssetBundle
                    .cachedAssetForUrlPath(asset.urlPath, asset.hash);

            // Make sure the asset has been downloaded.
            try {
                if (cachedAsset !== null && fs.accessSync(cachedAsset.getFile())) {
                    return cachedAsset;
                }
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    /**
     * Prepares asset bundle downloader.
     *
     * @param {AssetBundle} assetBundle - Asset bundle to download.
     * @param {string}      baseUrl     - Url to meteor server.
     * @private
     */
    downloadAssetBundle(assetBundle, baseUrl) {
        const missingAssets = [];

        assetBundle.getOwnAssets().forEach((asset) => {
            // Create containing directories for the asset if necessary
            const containingDirectory = path.dirname(asset.getFile());

            try {
                fs.lstatSync(containingDirectory);
            } catch (e) {
                shell.config.fatal = true;
                try {
                    shell.mkdir('-p', containingDirectory);
                } catch (shellError) {
                    this.didFail(`could not create containing directory: ${containingDirectory}`);
                    return;
                } finally {
                    shell.config.fatal = false;
                }
            }

            // If we find a cached asset, we copy it.
            const cachedAsset = this.cachedAssetForAsset(asset);

            if (cachedAsset !== null) {
                shell.config.fatal = true;
                try {
                    if (~cachedAsset.getFile().indexOf('desktop.asar')) {
                        originalFs.createReadStream(cachedAsset.getFile())
                            .pipe(originalFs.createWriteStream(asset.getFile()));
                    } else {
                        shell.cp(cachedAsset.getFile(), asset.getFile());
                    }
                } catch (e) {
                    this.didFail(e.message);
                } finally {
                    shell.config.fatal = false;
                }
            } else {
                missingAssets.push(asset);
            }
        });

        // If all assets were cached, there is no need to start a download.
        if (missingAssets.length === 0) {
            this.didFinishDownloadingAssetBundle(assetBundle);
            return;
        }

        let assetBundleDownloader = new AssetBundleDownloader(
            this.log,
            this.configuration,
            assetBundle,
            baseUrl,
            missingAssets
        );

        assetBundleDownloader.setCallbacks(
            () => {
                assetBundleDownloader = null;
                try {
                    this.moveDownloadedAssetBundleIntoPlace(assetBundle);
                    this.didFinishDownloadingAssetBundle(assetBundle);
                } catch (e) {
                    this.didFail(e);
                }
            },
            cause => this.didFail(cause)
        );
        assetBundleDownloader.resume();
    }

    /**
     * Move the downloaded asset bundle to a new directory named after the version.
     *
     * @param {AssetBundle} assetBundle - Asset bundle to move.
     * @private
     */
    moveDownloadedAssetBundleIntoPlace(assetBundle) {
        const version = assetBundle.getVersion();
        const versionDirectory = path.join(this.versionsDirectory, version);
        originalFs.renameSync(this.downloadDirectory, versionDirectory);
        assetBundle.didMoveToDirectoryAtUri(versionDirectory);
        this.downloadedAssetBundlesByVersion[version] = assetBundle;
    }

    /**
     * If there is an existing Downloading directory, move it
     * to PartialDownload and load the partiallyDownloadedAssetBundle so we
     * won't unnecessarily redownload assets.
     *
     * @private
     */
    moveExistingDownloadDirectoryIfNeeded() {
        shell.config.fatal = true;

        if (fs.existsSync(this.downloadDirectory)) {
            if (fs.existsSync(this.partialDownloadDirectory)) {
                try {
                    // Using rimraf specifically instead of shelljs.rm because despite using
                    // process.noAsar shelljs tried to remove files inside asar instead of just
                    // deleting the archive. `del` also could not delete asar archive. Rimraf is ok
                    // because it accepts custom fs object.
                    rimraf.sync(this.partialDownloadDirectory, originalFs);
                } catch (e) {
                    this.log.error('could not delete partial download directory.');
                    return;
                }
            }

            this.partiallyDownloadedAssetBundle = null;

            try {
                originalFs.renameSync(this.downloadDirectory, this.partialDownloadDirectory);
            } catch (e) {
                this.log.error('could not rename existing download directory');
                shell.config.fatal = false;
                return;
            }

            try {
                this.partiallyDownloadedAssetBundle =
                    new AssetBundle(
                        this.log,
                        this.partialDownloadDirectory,
                        undefined,
                        this.initialAssetBundle
                    );
            } catch (e) {
                this.log.warn('could not load partially downloaded asset bundle.');
            }
        }
        shell.config.fatal = false;
    }
}
module.exports = AssetBundleManager;
