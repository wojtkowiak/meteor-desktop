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

 This is based on:
 /cordova-plugin-meteor-webapp/blob/master/src/android/AssetBundleManager.java

 */


var shell = require('shelljs');
var path = require('path');
var AssetBundle = require('./assetBundle');
var AssetManifest = require('./assetManifest');
var AssetBundleDownloader = require('./assetBundleDownloader');
var fs = require('fs');
var request = require('request');
var url = require('url');
var Log = require('./logger');
var shellJsConfig;
require('shelljs/global');
shellJsConfig = config;

/**
 *
 * @param {object}      l                  - Logger instance.
 * @param {object}      configuration      - Configuration object.
 * @param {AssetBundle} initialAssetBundle - Parent asset bundle.
 * @param {string}      versionsDirectory  - Path to versions dir.
 * @constructor
 */
function AssetBundleManager(l, configuration, initialAssetBundle, versionsDirectory) {
    this._l = l.clone('AssetBundleManager');

    this._configuration = configuration;
    this._initialAssetBundle = initialAssetBundle;
    this._callback = null;
    this._versionsDirectory = versionsDirectory;

    this._downloadDirectory = path.join(versionsDirectory, 'Downloading');
    this._partialDownloadDirectory = path.join(versionsDirectory, 'PartialDownload');

    this._downloadedAssetBundlesByVersion = {};
    this._partiallyDownloadedAssetBundle = null;

    this._assetBundleDownloader = null;

    this._httpClient = request;

    this._loadDownloadedAssetBundles();
}

/**
 * Callback setter.
 *
 * @param {Object} callback
 */
AssetBundleManager.prototype.setCallback = function setCallback(callback) {
    this._callback = callback;
};


AssetBundleManager.prototype.downloadedAssetBundleWithVersion =
    function downloadedAssetBundleWithVersion(version) {
        return this._downloadedAssetBundlesByVersion[version];
    }

/**
 * Starts checking for available update.
 *
 * @param {string} baseUrl - Url of meteor server.
 */
AssetBundleManager.prototype.checkForUpdates = function checkForUpdates(baseUrl) {
    var self = this;
    var manifest;
    var version;
    var assetBundle;
    var downloadedAssetBundle;
    var manifestUrl = url.resolve(baseUrl, 'manifest.json');

    this._l.info('Trying to query ' + manifestUrl);
    this._httpClient(manifestUrl, function onHttpResponse(error, response, body) {
        if (!error) {
            if (response.statusCode !== 200) {
                self._didFail(
                    'Non-success status code ' + response.statusCode + ' for asset manifest'
                );
                return;
            }

            try {
                manifest = new AssetManifest(self._l, body);
            } catch (e) {
                self._didFail(e.message);
                return;
            }

            version = manifest.version;

            self._l.debug('Downloaded asset manifest for version: ' + version);

            if (
                self._assetBundleDownloader !== null &&
                self._assetBundleDownloader.getAssetBundle().getVersion() === version
            ) {
                self._l.info('Already downloading asset bundle version: ' + version);
                return;
            }

            // Give the callback a chance to decide whether the version should be downloaded.
            if (
                self._callback !== null && !self._callback.shouldDownloadBundleForManifest(manifest)
            ) {
                return;
            }

            // Cancel download in progress if there is one.
            if (self._assetBundleDownloader !== null) {
                self._assetBundleDownloader.cancel();
            }
            self._assetBundleDownloader = null;

            // There is no need to redownload the initial version.
            if (self._initialAssetBundle.getVersion() === version) {
                self._l.debug('No redownload of initial version.');
                self._didFinishDownloadingAssetBundle(self._initialAssetBundle);
                return;
            }

            // If there is a previously downloaded asset bundle with the requested
            // version, use that.
            if (version in self._downloadedAssetBundlesByVersion) {
                downloadedAssetBundle = self._downloadedAssetBundlesByVersion[version];
                if (downloadedAssetBundle !== null) {
                    self._didFinishDownloadingAssetBundle(downloadedAssetBundle);
                    return;
                }
            }

            // Else, get ready to download the new asset bundle

            self._moveExistingDownloadDirectoryIfNeeded();

            // Create download directory
            if (!self._makeDownloadDirectory()) {
                self._didFail('Could not create download directory');
                return;
            }

            // Copy downloaded asset manifest to file.
            try {
                fs.writeFileSync(path.join(self._downloadDirectory, 'program.json'), body);
            } catch (e) {
                self._didFail(e.message);
                return;
            }
            self._l.debug('Manifest copied to new Download dir');


            assetBundle = null;
            try {
                assetBundle = new AssetBundle(
                    self._l,
                    self._downloadDirectory,
                    manifest,
                    self._initialAssetBundle
                );
            } catch (e) {
                self._didFail(e.message);
                return;
            }

            self._downloadAssetBundle(assetBundle, baseUrl);
        } else {
            self._didFail('Error downloading asset manifest: ' + error);
        }
    });
};

/**
 * Removes unnecessary versions.
 *
 * @param {string} versionToKeep
 */
AssetBundleManager.prototype.removeAllDownloadedAssetBundlesExceptForVersion =
    function removeAllDownloadedAssetBundlesExceptForVersion(versionToKeep) {
        var self = this;
        Object.keys(this._downloadedAssetBundlesByVersion).forEach(
            function eachVersion(assetVersion) {
                var assetBundle = self._downloadedAssetBundlesByVersion[assetVersion];
                var version = assetBundle.getVersion();

                if (version !== versionToKeep) {
                    shell.rm('-rf', path.join(self._versionsDirectory, version));
                    delete self._downloadedAssetBundlesByVersion[version];
                }
            });
    };

/**
 * Creates Download directory.
 *
 * @returns {boolean}
 * @private
 */
AssetBundleManager.prototype._makeDownloadDirectory = function _makeDownloadDirectory() {
    // Make shellJs throw on failure.
    shellJsConfig.fatal = true;
    try {
        if (!fs.existsSync(this._downloadDirectory)) {
            this._l.info('Created download dir.');
            shell.mkdir(this._downloadDirectory);
        }
        shellJsConfig.fatal = false;
        return true;
    } catch (e) {
        this._l.debug('Creating download dir failed: ' + e.message);
    }
    shellJsConfig.fatal = false;
    return false;
};

/**
 * Loads all downloaded asset bundles.
 *
 * @private
 */
AssetBundleManager.prototype._loadDownloadedAssetBundles = function _loadDownloadedAssetBundles() {
    var self = this;
    var assetBundle;

    shell.ls(this._versionsDirectory).forEach(function eachVersionDir(file) {
        const directory = path.join(self._versionsDirectory, file);
        if (self._downloadDirectory !== directory
            && self._partialDownloadDirectory !== directory
            && fs.lstatSync(directory).isDirectory()
        ) {
            assetBundle = new AssetBundle(
                self._l,
                directory,
                undefined,
                self._initialAssetBundle
            );
            self._l.info('Got version: ' + assetBundle.getVersion() + ' in ' + file);
            self._downloadedAssetBundlesByVersion[assetBundle.getVersion()] = assetBundle;
        }
    });

};

/**
 * Failure handler.
 *
 * @param {string} cause - Error message.
 * @private
 */
AssetBundleManager.prototype._didFail = function _didFail(cause) {
    this._assetBundleDownloader = null;
    this._l.debug('Fail: ' + cause);

    if (this._callback !== null) {
        this._callback.onError(cause);
    }
};

/**
 * Success handler.
 *
 * @param {AssetBundle} assetBundle - Asset bundle which was downloaded.
 * @private
 */
AssetBundleManager.prototype._didFinishDownloadingAssetBundle =
    function _didFinishDownloadingAssetBundle(assetBundle) {
        this._assetBundleDownloader = null;

        if (this._callback !== null) {
            this._callback.onFinishedDownloadingAssetBundle(assetBundle);
        }
    };


/**
 * Searches for a cached asset in all available bundles.
 *
 * @param {Asset} asset - Asset we are searching for.
 * @returns {Asset|null}
 * @private
 */
AssetBundleManager.prototype._cachedAssetForAsset = function _cachedAssetForAsset(asset) {
    var self = this;
    var assetBundleKey;
    var assetBundle;

    var bundles = Object.keys(this._downloadedAssetBundlesByVersion).reduce(
        function reduceBundles(arr, key) {
            arr.push(self._downloadedAssetBundlesByVersion[key]);
            return arr;
        },
        []
    );

    var cachedAsset;
    for (assetBundleKey in bundles) {
        if (bundles.hasOwnProperty(assetBundleKey)) {
            assetBundle = bundles[assetBundleKey];
            cachedAsset = assetBundle.cachedAssetForUrlPath(asset.urlPath, asset.hash);
            if (cachedAsset !== null) {
                return cachedAsset;
            }
        }
    }

    if (this._partiallyDownloadedAssetBundle !== null) {
        cachedAsset =
            this._partiallyDownloadedAssetBundle.cachedAssetForUrlPath(asset.urlPath, asset.hash);

        // Make sure the asset has been downloaded.
        if (cachedAsset !== null && fs.existsSync(cachedAsset.getFile())) {
            return cachedAsset;
        }
    }

    return null;
};

/**
 * Prepareas asset bundle downloader.
 *
 * @param {AssetBundle} assetBundle - Asset bundle to download.
 * @param {string}      baseUrl     - Url to meteor server.
 * @private
 */
AssetBundleManager.prototype._downloadAssetBundle =
    function _downloadAssetBundle(assetBundle, baseUrl) {
        var self = this;
        var cachedAsset;
        var assetBundleDownloader;
        var missingAssets = [];

        assetBundle.getOwnAssets().forEach(function ownAsset(asset) {
            // Create containing directories for the asset if necessary

            var containingDirectory = path.dirname(asset.getFile());

            if (!fs.existsSync(containingDirectory)) {
                shellJsConfig.fatal = true;
                try {
                    shell.mkdir('-p', containingDirectory);
                } catch (e) {
                    self._didFail('Could not create containing directory: ' + containingDirectory);
                    shellJsConfig.fatal = false;
                    return;
                }
                shellJsConfig.fatal = false;
            }

            // If we find a cached asset, we copy it.
            cachedAsset = self._cachedAssetForAsset(asset);

            if (cachedAsset !== null) {
                shellJsConfig.fatal = true;
                try {
                    shell.cp(cachedAsset.getFile(), asset.getFile());
                } catch (e) {
                    self._didFail(e.message);
                    shellJsConfig.fatal = false;
                    return;
                }
                shellJsConfig.fatal = false;
            } else {
                missingAssets.push(asset);
            }
        });

        // If all assets were cached, there is no need to start a download
        if (missingAssets.length === 0) {
            this._didFinishDownloadingAssetBundle(assetBundle);
            return;
        }

        assetBundleDownloader = new AssetBundleDownloader(
            this._l,
            this._configuration,
            assetBundle,
            baseUrl,
            missingAssets
        );

        assetBundleDownloader.setCallback(
            function onFinished() {
                assetBundleDownloader = null;
                self._moveDownloadedAssetBundleIntoPlace(assetBundle);
                self._didFinishDownloadingAssetBundle(assetBundle);
            },
            function onFailure(cause) {
                self._didFail(cause);
            }
        );
        assetBundleDownloader.resume();
    };

/**
 * Move the downloaded asset bundle to a new directory named after the version.
 *
 * @param {AssetBundle} assetBundle - Asset bundle to move.
 * @private
 */
AssetBundleManager.prototype._moveDownloadedAssetBundleIntoPlace =
    function _moveDownloadedAssetBundleIntoPlace(assetBundle) {
        var version = assetBundle.getVersion();
        var versionDirectory = path.join(this._versionsDirectory, version);
        shell.mv(this._downloadDirectory, versionDirectory);
        assetBundle.didMoveToDirectoryAtUri(versionDirectory);
        this._downloadedAssetBundlesByVersion[version] = assetBundle;
    };

/**
 * If there is an existing Downloading directory, move it
 * to PartialDownload and load the partiallyDownloadedAssetBundle so we
 * don't unnecessarily redownload assets.
 *
 * @private
 */
AssetBundleManager.prototype._moveExistingDownloadDirectoryIfNeeded =
    function _moveExistingDownloadDirectoryIfNeeded() {
        shellJsConfig.fatal = true;

        if (fs.existsSync(this._downloadDirectory)) {
            if (fs.existsSync(this._partialDownloadDirectory)) {
                try {
                    shell.rm('-Rf', this._partialDownloadDirectory);
                } catch (e) {
                    this._l.error('Could not delete partial download directory.');
                }
            }

            this._partiallyDownloadedAssetBundle = null;

            try {
                shell.mv(this._downloadDirectory, this._partialDownloadDirectory);
            } catch (e) {
                this._l.error('Could not rename existing download directory');
                shellJsConfig.fatal = false;
                return;
            }

            try {
                this._partiallyDownloadedAssetBundle =
                    new AssetBundle(
                        this._l,
                        this._partialDownloadDirectory,
                        undefined,
                        this._initialAssetBundle
                    );
            } catch (e) {
                this._l.warn('Could not load partially downloaded asset bundle.');
            }
        }
        shellJsConfig.fatal = false;
    };

module.exports = AssetBundleManager;
