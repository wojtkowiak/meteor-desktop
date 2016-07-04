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
import shell from 'shelljs';
import fs from 'fs';
import url from 'url';
import request from 'request';

import AssetBundle from './assetBundle';
import AssetBundleDownloader from './assetBundleDownloader';
import AssetManifest from './assetManifest';

require('shelljs/global');
const shellJsConfig = config;

function exists(checkPath) {
    try {
        fs.accessSync(checkPath);
        return true;
    } catch (e) {
        return false;
    }
}
class AssetBundleManager {

    /**
     * @param {object}      log                - Winston reference.
     * @param {object}      configuration      - Configuration object.
     * @param {AssetBundle} initialAssetBundle - Parent asset bundle.
     * @param {string}      versionsDirectory  - Path to versions dir.
     * @constructor
     */
    constructor(log, configuration, initialAssetBundle, versionsDirectory) {
        this.log = log.getLoggerFor('AssetBundleManager');

        this.configuration = configuration;
        this.initialAssetBundle = initialAssetBundle;

        this.versionsDirectory = versionsDirectory;

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
     * Starts checking for available update.
     *
     * @param {string} baseUrl - Url of meteor server.
     */
    checkForUpdates(baseUrl) {
        let manifest;
        const manifestUrl = url.resolve(baseUrl, 'manifest.json');

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

            const version = manifest.version;

            this.log.debug(`downloaded asset manifest for version: ${version}`);

            if (
                this.assetBundleDownloader !== null &&
                this.assetBundleDownloader.getAssetBundle().getVersion() === version
            ) {
                this.log.info(`already downloading asset bundle version: ${version}`);
                return;
            }

            // Give the callback a chance to decide whether the version should be downloaded.
            if (
                this.callback !== null && !this.callback.shouldDownloadBundleForManifest(manifest)
            ) {
                return;
            }

            // Cancel download in progress if there is one.
            if (this.assetBundleDownloader !== null) {
                this.assetBundleDownloader.cancel();
            }
            this.assetBundleDownloader = null;

            // There is no need to redownload the initial version.
            if (this.initialAssetBundle.getVersion() === version) {
                this.log.debug('No redownload of initial version.');
                this.didFinishDownloadingAssetBundle(this.initialAssetBundle);
                return;
            }

            // If there is a previously downloaded asset bundle with the requested
            // version, use that.
            if (version in this.downloadedAssetBundlesByVersion) {
                const downloadedAssetBundle = this.downloadedAssetBundlesByVersion[version];
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
                    this.initialAssetBundle
                );
            } catch (e) {
                this.didFail(e.message);
                return;
            }

            this.downloadAssetBundle(assetBundle, baseUrl);
        });
    }

    /**
     * Removes unnecessary versions.
     *
     * @param {string} versionToKeep
     */
    removeAllDownloadedAssetBundlesExceptForVersion(versionToKeep) {
        Object.keys(this.downloadedAssetBundlesByVersion).forEach(
            assetVersion => {
                const assetBundle = this.downloadedAssetBundlesByVersion[assetVersion];
                const version = assetBundle.getVersion();

                if (version !== versionToKeep) {
                    shell.rm('-rf', path.join(this.versionsDirectory, version));
                    delete this.downloadedAssetBundlesByVersion[version];
                }
            });
    }

    /**
     * Creates Download directory.
     *
     * @returns {boolean}
     * @private
     */
    makeDownloadDirectory() {
        // Make shellJs throw on failure.
        shellJsConfig.fatal = true;
        try {
            if (!fs.existsSync(this.downloadDirectory)) {
                this.log.info('created download dir.');
                shell.mkdir(this.downloadDirectory);
            }
            shellJsConfig.fatal = false;
            return true;
        } catch (e) {
            this.log.debug(`creating download dir failed: ${e.message}`);
        }
        shellJsConfig.fatal = false;
        return false;
    }

    /**
     * Loads all downloaded asset bundles.
     *
     * @private
     */
    loadDownloadedAssetBundles() {
        shell.ls(this.versionsDirectory).forEach(file => {
            const directory = path.join(this.versionsDirectory, file);
            if (this.downloadDirectory !== directory
                && this.partialDownloadDirectory !== directory
                && fs.lstatSync(directory).isDirectory()
            ) {
                const assetBundle = new AssetBundle(
                    this.log,
                    directory,
                    undefined,
                    this.initialAssetBundle
                );
                this.log.info(`got version: ${assetBundle.getVersion()} in ${file}`);
                this.downloadedAssetBundlesByVersion[assetBundle.getVersion()] = assetBundle;
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
     * @param {AssetBundle} assetBundle - Asset bundle which was downloaded.
     * @private
     */
    didFinishDownloadingAssetBundle(assetBundle) {
        this.assetBundleDownloader = null;

        if (this.callback !== null) {
            this.callback.onFinishedDownloadingAssetBundle(assetBundle);
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
        const assetFound = bundles.some(assetBundle => {
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

        assetBundle.getOwnAssets().forEach(asset => {
            // Create containing directories for the asset if necessary
            const containingDirectory = path.dirname(asset.getFile());

            try {
                fs.lstatSync(containingDirectory);
            } catch (e) {
                shellJsConfig.fatal = true;
                try {
                    shell.mkdir('-p', containingDirectory);
                } catch (shellError) {
                    this.didFail(`could not create containing directory: ${containingDirectory}`);
                    shellJsConfig.fatal = false;
                    return;
                }
                shellJsConfig.fatal = false;
            }

            // If we find a cached asset, we copy it.
            const cachedAsset = this.cachedAssetForAsset(asset);

            if (cachedAsset !== null) {
                shellJsConfig.fatal = true;
                try {
                    shell.cp(cachedAsset.getFile(), asset.getFile());
                } catch (e) {
                    this.didFail(e.message);
                    shellJsConfig.fatal = false;
                    return;
                }
                shellJsConfig.fatal = false;
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
                this.moveDownloadedAssetBundleIntoPlace(assetBundle);
                this.didFinishDownloadingAssetBundle(assetBundle);
            },
            cause => {
                this.didFail(cause);
            }
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
        shell.mv(this.downloadDirectory, versionDirectory);
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
        shellJsConfig.fatal = true;

        if (exists(this.downloadDirectory)) {
            if (exists(this.partialDownloadDirectory)) {
                try {
                    shell.rm('-Rf', this.partialDownloadDirectory);
                } catch (e) {
                    this.log.error('could not delete partial download directory.');
                }
            }

            this.partiallyDownloadedAssetBundle = null;

            try {
                shell.mv(this.downloadDirectory, this.partialDownloadDirectory);
            } catch (e) {
                this.log.error('could not rename existing download directory');
                shellJsConfig.fatal = false;
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
        shellJsConfig.fatal = false;
    }
}
module.exports = AssetBundleManager;
