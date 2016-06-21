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
    this.log = new Log('AssetBundleManager', l);

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

    this._httpClient(manifestUrl, function onHttpResponse(error, response, body) {
        if (!error) {
            if (response.statusCode !== 200) {
                self._didFail('Non-success status code ' + response.statusCode + ' for asset manifest');
                return;
            }

            try {
                manifest = new AssetManifest(self.log.getUnwrappedLogger(), body);
            } catch (e) {
                self._didFail(e.message);
                return;
            }

            version = manifest.version;

            self.log.log('debug', 'Downloaded asset manifest for version: ' + version);

            if (self._assetBundleDownloader !== null && self._assetBundleDownloader.getAssetBundle().getVersion() === version) {
                self.log.log('info', 'Already downloading asset bundle version: ' + version);
                return;
            }

            // Give the callback a chance to decide whether the version should be downloaded.
            if (self._callback !== null && !self._callback.shouldDownloadBundleForManifest(manifest)) {
                return;
            }

            // Cancel download in progress if there is one.
            if (self._assetBundleDownloader !== null) {
                self._assetBundleDownloader.cancel();
            }
            self._assetBundleDownloader = null;

            // There is no need to redownload the initial version.
            if (self._initialAssetBundle.getVersion() === version) {
                self.log.log('debug', 'No redownload of initial version.');
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
            self.log.log('debug', 'Manifest copied to new Download dir');

            assetBundle = null;
            try {
                assetBundle = new AssetBundle(self.log.getUnwrappedLogger(), self._downloadDirectory, manifest, self._initialAssetBundle);
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
AssetBundleManager.prototype.removeAllDownloadedAssetBundlesExceptForVersion = function removeAllDownloadedAssetBundlesExceptForVersion(versionToKeep) {
    var self = this;
    Object.keys(this._downloadedAssetBundlesByVersion).forEach(function eachVersion(assetVersion) {
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
            this.log.log('info', 'Created download dir.');
            shell.mkdir(this._downloadDirectory);
        }
        shellJsConfig.fatal = false;
        return true;
    } catch (e) {
        this.log.log('debug', 'Creating download dir failed: ' + e.message);
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

    shell.ls('-d', path.join(this._versionsDirectory, '*')).forEach(function eachVersionDir(file) {
        if (self._downloadDirectory !== path.normalize(file) && self._partialDownloadDirectory !== path.normalize(file) && fs.lstatSync(file).isDirectory()) {
            assetBundle = new AssetBundle(self.log.getUnwrappedLogger(), file, undefined, self._initialAssetBundle);
            self.log.log('info', 'Got version: ' + assetBundle.getVersion() + ' in ' + file);
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
    this.log.log('debug', 'Fail: ' + cause);

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
AssetBundleManager.prototype._didFinishDownloadingAssetBundle = function _didFinishDownloadingAssetBundle(assetBundle) {
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

    var bundles = Object.keys(this._downloadedAssetBundlesByVersion).reduce(function reduceBundles(arr, key) {
        arr.push(self._downloadedAssetBundlesByVersion[key]);
        return arr;
    }, []);

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
        cachedAsset = this._partiallyDownloadedAssetBundle.cachedAssetForUrlPath(asset.urlPath, asset.hash);

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
AssetBundleManager.prototype._downloadAssetBundle = function _downloadAssetBundle(assetBundle, baseUrl) {
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

    assetBundleDownloader = new AssetBundleDownloader(this.log.getUnwrappedLogger(), this._configuration, assetBundle, baseUrl, missingAssets);

    assetBundleDownloader.setCallback(function onFinished() {
        assetBundleDownloader = null;
        self._moveDownloadedAssetBundleIntoPlace(assetBundle);
        self._didFinishDownloadingAssetBundle(assetBundle);
    }, function onFailure(cause) {
        self._didFail(cause);
    });
    assetBundleDownloader.resume();
};

/**
 * Move the downloaded asset bundle to a new directory named after the version.
 *
 * @param {AssetBundle} assetBundle - Asset bundle to move.
 * @private
 */
AssetBundleManager.prototype._moveDownloadedAssetBundleIntoPlace = function _moveDownloadedAssetBundleIntoPlace(assetBundle) {
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
AssetBundleManager.prototype._moveExistingDownloadDirectoryIfNeeded = function _moveExistingDownloadDirectoryIfNeeded() {
    shellJsConfig.fatal = true;

    if (fs.existsSync(this._downloadDirectory)) {
        if (fs.existsSync(this._partialDownloadDirectory)) {
            try {
                shell.rm('-Rf', this._partialDownloadDirectory);
            } catch (e) {
                this.log.log('error', 'Could not delete partial download directory.');
            }
        }

        this._partiallyDownloadedAssetBundle = null;

        try {
            shell.mv(this._downloadDirectory, this._partialDownloadDirectory);
        } catch (e) {
            this.log.log('error', 'Could not rename existing download directory');
            shellJsConfig.fatal = false;
            return;
        }

        try {
            this._partiallyDownloadedAssetBundle = new AssetBundle(this.log.getUnwrappedLogger(), this._partialDownloadDirectory, undefined, this._initialAssetBundle);
        } catch (e) {
            this.log.log('warn', 'Could not load partially downloaded asset bundle.');
        }
    }
    shellJsConfig.fatal = false;
};

module.exports = AssetBundleManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1vZHVsZXMvYXV0b3VwZGF0ZS9hc3NldEJ1bmRsZU1hbmFnZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWdDQSxJQUFJLFFBQVEsUUFBUSxTQUFSLENBQVo7QUFDQSxJQUFJLE9BQU8sUUFBUSxNQUFSLENBQVg7QUFDQSxJQUFJLGNBQWMsUUFBUSxlQUFSLENBQWxCO0FBQ0EsSUFBSSxnQkFBZ0IsUUFBUSxpQkFBUixDQUFwQjtBQUNBLElBQUksd0JBQXdCLFFBQVEseUJBQVIsQ0FBNUI7QUFDQSxJQUFJLEtBQUssUUFBUSxJQUFSLENBQVQ7QUFDQSxJQUFJLFVBQVUsUUFBUSxTQUFSLENBQWQ7QUFDQSxJQUFJLE1BQU0sUUFBUSxLQUFSLENBQVY7QUFDQSxJQUFJLE1BQU0sUUFBUSxVQUFSLENBQVY7QUFDQSxJQUFJLGFBQUo7QUFDQSxRQUFRLGdCQUFSO0FBQ0EsZ0JBQWdCLE1BQWhCOzs7Ozs7Ozs7O0FBVUEsU0FBUyxrQkFBVCxDQUE0QixDQUE1QixFQUErQixhQUEvQixFQUE4QyxrQkFBOUMsRUFBa0UsaUJBQWxFLEVBQXFGO0FBQ2pGLFNBQUssRUFBTCxHQUFVLElBQUksR0FBSixDQUFRLG9CQUFSLEVBQThCLENBQTlCLENBQVY7O0FBRUEsU0FBSyxjQUFMLEdBQXNCLGFBQXRCO0FBQ0EsU0FBSyxtQkFBTCxHQUEyQixrQkFBM0I7QUFDQSxTQUFLLFNBQUwsR0FBaUIsSUFBakI7QUFDQSxTQUFLLGtCQUFMLEdBQTBCLGlCQUExQjs7QUFFQSxTQUFLLGtCQUFMLEdBQTBCLEtBQUssSUFBTCxDQUFVLGlCQUFWLEVBQTZCLGFBQTdCLENBQTFCO0FBQ0EsU0FBSyx5QkFBTCxHQUFpQyxLQUFLLElBQUwsQ0FBVSxpQkFBVixFQUE2QixpQkFBN0IsQ0FBakM7O0FBRUEsU0FBSyxnQ0FBTCxHQUF3QyxFQUF4QztBQUNBLFNBQUssK0JBQUwsR0FBdUMsSUFBdkM7O0FBRUEsU0FBSyxzQkFB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QUFkLEdBQXNCLEtBQXRCO0FBQ0gsQ0FwQ0w7O0FBc0NBLE9BQU8sT0FBUCxHQUFpQixrQkFBakIiLCJmaWxlIjoibW9kdWxlcy9hdXRvdXBkYXRlL2Fzc2V0QnVuZGxlTWFuYWdlci5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gVGhpcyBpcyBhIHNsaWdodGx5IG1vZGlmaWVkIEpTIHBvcnQgb2YgaG90IGNvZGUgcHVzaCBhbmRyb2lkIGNsaWVudCBmcm9tIGhlcmU6XHJcbiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL2NvcmRvdmEtcGx1Z2luLW1ldGVvci13ZWJhcHBcclxuXHJcbiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcclxuXHJcbiBDb3B5cmlnaHQgKGMpIDIwMTUgTWV0ZW9yIERldmVsb3BtZW50IEdyb3VwXHJcblxyXG4gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxyXG4gb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxyXG4gaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xyXG4gdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxyXG4gY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXHJcbiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxyXG5cclxuIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxyXG4gY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cclxuXHJcbiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXHJcbiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcclxuIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxyXG4gQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxyXG4gTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcclxuIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXHJcbiBTT0ZUV0FSRS5cclxuXHJcbiBUaGlzIGlzIGJhc2VkIG9uOlxyXG4gL2NvcmRvdmEtcGx1Z2luLW1ldGVvci13ZWJhcHAvYmxvYi9tYXN0ZXIvc3JjL2FuZHJvaWQvQXNzZXRCdW5kbGVNYW5hZ2VyLmphdmFcclxuXHJcbiAqL1xyXG5cclxuXHJcbnZhciBzaGVsbCA9IHJlcXVpcmUoJ3NoZWxsanMnKTtcclxudmFyIHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XHJcbnZhciBBc3NldEJ1bmRsZSA9IHJlcXVpcmUoJy4vYXNzZXRCdW5kbGUnKTtcclxudmFyIEFzc2V0TWFuaWZlc3QgPSByZXF1aXJlKCcuL2Fzc2V0TWFuaWZlc3QnKTtcclxudmFyIEFzc2V0QnVuZGxlRG93bmxvYWRlciA9IHJlcXVpcmUoJy4vYXNzZXRCdW5kbGVEb3dubG9hZGVyJyk7XHJcbnZhciBmcyA9IHJlcXVpcmUoJ2ZzJyk7XHJcbnZhciByZXF1ZXN0ID0gcmVxdWlyZSgncmVxdWVzdCcpO1xyXG52YXIgdXJsID0gcmVxdWlyZSgndXJsJyk7XHJcbnZhciBMb2cgPSByZXF1aXJlKCcuL2xvZ2dlcicpO1xyXG52YXIgc2hlbGxKc0NvbmZpZztcclxucmVxdWlyZSgnc2hlbGxqcy9nbG9iYWwnKTtcclxuc2hlbGxKc0NvbmZpZyA9IGNvbmZpZztcclxuXHJcbi8qKlxyXG4gKlxyXG4gKiBAcGFyYW0ge29iamVjdH0gICAgICBsICAgICAgICAgICAgICAgICAgLSBMb2dnZXIgaW5zdGFuY2UuXHJcbiAqIEBwYXJhbSB7b2JqZWN0fSAgICAgIGNvbmZpZ3VyYXRpb24gICAgICAtIENvbmZpZ3VyYXRpb24gb2JqZWN0LlxyXG4gKiBAcGFyYW0ge0Fzc2V0QnVuZGxlfSBpbml0aWFsQXNzZXRCdW5kbGUgLSBQYXJlbnQgYXNzZXQgYnVuZGxlLlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gICAgICB2ZXJzaW9uc0RpcmVjdG9yeSAgLSBQYXRoIHRvIHZlcnNpb25zIGRpci5cclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBBc3NldEJ1bmRsZU1hbmFnZXIobCwgY29uZmlndXJhdGlvbiwgaW5pdGlhbEFzc2V0QnVuZGxlLCB2ZXJzaW9uc0RpcmVjdG9yeSkge1xyXG4gICAgdGhpcy5fbCA9IG5ldyBMb2coJ0Fzc2V0QnVuZGxlTWFuYWdlcicsIGwpO1xyXG5cclxuICAgIHRoaXMuX2NvbmZpZ3VyYXRpb24gPSBjb25maWd1cmF0aW9uO1xyXG4gICAgdGhpcy5faW5pdGlhbEFzc2V0QnVuZGxlID0gaW5pdGlhbEFzc2V0QnVuZGxlO1xyXG4gICAgdGhpcy5fY2FsbGJhY2sgPSBudWxsO1xyXG4gICAgdGhpcy5fdmVyc2lvbnNEaXJlY3RvcnkgPSB2ZXJzaW9uc0RpcmVjdG9yeTtcclxuXHJcbiAgICB0aGlzLl9kb3dubG9hZERpcmVjdG9yeSA9IHBhdGguam9pbih2ZXJzaW9uc0RpcmVjdG9yeSwgJ0Rvd25sb2FkaW5nJyk7XHJcbiAgICB0aGlzLl9wYXJ0aWFsRG93bmxvYWREaXJlY3RvcnkgPSBwYXRoLmpvaW4odmVyc2lvbnNEaXJlY3RvcnksICdQYXJ0aWFsRG93bmxvYWQnKTtcclxuXHJcbiAgICB0aGlzLl9kb3dubG9hZGVkQXNzZXRCdW5kbGVzQnlWZXJzaW9uID0ge307XHJcbiAgICB0aGlzLl9wYXJ0aWFsbHlEb3dubG9hZGVkQXNzZXRCdW5kbGUgPSBudWxsO1xyXG5cclxuICAgIHRoaXMuX2Fzc2V0QnVuZGxlRG93bmxvYWRlciA9IG51bGw7XHJcblxyXG4gICAgdGhpcy5faHR0cENsaWVudCA9IHJlcXVlc3Q7XHJcblxyXG4gICAgdGhpcy5fbG9hZERvd25sb2FkZWRBc3NldEJ1bmRsZXMoKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENhbGxiYWNrIHNldHRlci5cclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IGNhbGxiYWNrXHJcbiAqL1xyXG5Bc3NldEJ1bmRsZU1hbmFnZXIucHJvdG90eXBlLnNldENhbGxiYWNrID0gZnVuY3Rpb24gc2V0Q2FsbGJhY2soY2FsbGJhY2spIHtcclxuICAgIHRoaXMuX2NhbGxiYWNrID0gY2FsbGJhY2s7XHJcbn07XHJcblxyXG4vKipcclxuICogU3RhcnRzIGNoZWNraW5nIGZvciBhdmFpbGFibGUgdXBkYXRlLlxyXG4gKlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gYmFzZVVybCAtIFVybCBvZiBtZXRlb3Igc2VydmVyLlxyXG4gKi9cclxuQXNzZXRCdW5kbGVNYW5hZ2VyLnByb3RvdHlwZS5jaGVja0ZvclVwZGF0ZXMgPSBmdW5jdGlvbiBjaGVja0ZvclVwZGF0ZXMoYmFzZVVybCkge1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgdmFyIG1hbmlmZXN0O1xyXG4gICAgdmFyIHZlcnNpb247XHJcbiAgICB2YXIgYXNzZXRCdW5kbGU7XHJcbiAgICB2YXIgZG93bmxvYWRlZEFzc2V0QnVuZGxlO1xyXG4gICAgdmFyIG1hbmlmZXN0VXJsID0gdXJsLnJlc29sdmUoYmFzZVVybCwgJ21hbmlmZXN0Lmpzb24nKTtcclxuXHJcbiAgICB0aGlzLl9odHRwQ2xpZW50KG1hbmlmZXN0VXJsLCBmdW5jdGlvbiBvbkh0dHBSZXNwb25zZShlcnJvciwgcmVzcG9uc2UsIGJvZHkpIHtcclxuICAgICAgICBpZiAoIWVycm9yKSB7XHJcbiAgICAgICAgICAgIGlmIChyZXNwb25zZS5zdGF0dXNDb2RlICE9PSAyMDApIHtcclxuICAgICAgICAgICAgICAgIHNlbGYuX2RpZEZhaWwoXHJcbiAgICAgICAgICAgICAgICAgICAgJ05vbi1zdWNjZXNzIHN0YXR1cyBjb2RlICcgKyByZXNwb25zZS5zdGF0dXNDb2RlICsgJyBmb3IgYXNzZXQgbWFuaWZlc3QnXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgbWFuaWZlc3QgPSBuZXcgQXNzZXRNYW5pZmVzdChzZWxmLl9sLmdldFVud3JhcHBlZExvZ2dlcigpLCBib2R5KTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgc2VsZi5fZGlkRmFpbChlLm1lc3NhZ2UpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB2ZXJzaW9uID0gbWFuaWZlc3QudmVyc2lvbjtcclxuXHJcbiAgICAgICAgICAgIHNlbGYuX2wubG9nKCdkZWJ1ZycsICdEb3dubG9hZGVkIGFzc2V0IG1hbmlmZXN0IGZvciB2ZXJzaW9uOiAnICsgdmVyc2lvbik7XHJcblxyXG4gICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICBzZWxmLl9hc3NldEJ1bmRsZURvd25sb2FkZXIgIT09IG51bGwgJiZcclxuICAgICAgICAgICAgICAgIHNlbGYuX2Fzc2V0QnVuZGxlRG93bmxvYWRlci5nZXRBc3NldEJ1bmRsZSgpLmdldFZlcnNpb24oKSA9PT0gdmVyc2lvblxyXG4gICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgIHNlbGYuX2wubG9nKCdpbmZvJywgJ0FscmVhZHkgZG93bmxvYWRpbmcgYXNzZXQgYnVuZGxlIHZlcnNpb246ICcgKyB2ZXJzaW9uKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gR2l2ZSB0aGUgY2FsbGJhY2sgYSBjaGFuY2UgdG8gZGVjaWRlIHdoZXRoZXIgdGhlIHZlcnNpb24gc2hvdWxkIGJlIGRvd25sb2FkZWQuXHJcbiAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgIHNlbGYuX2NhbGxiYWNrICE9PSBudWxsICYmXHJcbiAgICAgICAgICAgICAgICAhc2VsZi5fY2FsbGJhY2suc2hvdWxkRG93bmxvYWRCdW5kbGVGb3JNYW5pZmVzdChtYW5pZmVzdClcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIENhbmNlbCBkb3dubG9hZCBpbiBwcm9ncmVzcyBpZiB0aGVyZSBpcyBvbmUuXHJcbiAgICAgICAgICAgIGlmIChzZWxmLl9hc3NldEJ1bmRsZURvd25sb2FkZXIgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHNlbGYuX2Fzc2V0QnVuZGxlRG93bmxvYWRlci5jYW5jZWwoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzZWxmLl9hc3NldEJ1bmRsZURvd25sb2FkZXIgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgLy8gVGhlcmUgaXMgbm8gbmVlZCB0byByZWRvd25sb2FkIHRoZSBpbml0aWFsIHZlcnNpb24uXHJcbiAgICAgICAgICAgIGlmIChzZWxmLl9pbml0aWFsQXNzZXRCdW5kbGUuZ2V0VmVyc2lvbigpID09PSB2ZXJzaW9uKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxmLl9sLmxvZygnZGVidWcnLCAnTm8gcmVkb3dubG9hZCBvZiBpbml0aWFsIHZlcnNpb24uJyk7XHJcbiAgICAgICAgICAgICAgICBzZWxmLl9kaWRGaW5pc2hEb3dubG9hZGluZ0Fzc2V0QnVuZGxlKHNlbGYuX2luaXRpYWxBc3NldEJ1bmRsZSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIElmIHRoZXJlIGlzIGEgcHJldmlvdXNseSBkb3dubG9hZGVkIGFzc2V0IGJ1bmRsZSB3aXRoIHRoZSByZXF1ZXN0ZWRcclxuICAgICAgICAgICAgLy8gdmVyc2lvbiwgdXNlIHRoYXQuXHJcbiAgICAgICAgICAgIGlmICh2ZXJzaW9uIGluIHNlbGYuX2Rvd25sb2FkZWRBc3NldEJ1bmRsZXNCeVZlcnNpb24pIHtcclxuICAgICAgICAgICAgICAgIGRvd25sb2FkZWRBc3NldEJ1bmRsZSA9IHNlbGYuX2Rvd25sb2FkZWRBc3NldEJ1bmRsZXNCeVZlcnNpb25bdmVyc2lvbl07XHJcbiAgICAgICAgICAgICAgICBpZiAoZG93bmxvYWRlZEFzc2V0QnVuZGxlICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fZGlkRmluaXNoRG93bmxvYWRpbmdBc3NldEJ1bmRsZShkb3dubG9hZGVkQXNzZXRCdW5kbGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gRWxzZSwgZ2V0IHJlYWR5IHRvIGRvd25sb2FkIHRoZSBuZXcgYXNzZXQgYnVuZGxlXHJcblxyXG4gICAgICAgICAgICBzZWxmLl9tb3ZlRXhpc3RpbmdEb3dubG9hZERpcmVjdG9yeUlmTmVlZGVkKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgZG93bmxvYWQgZGlyZWN0b3J5XHJcbiAgICAgICAgICAgIGlmICghc2VsZi5fbWFrZURvd25sb2FkRGlyZWN0b3J5KCkpIHtcclxuICAgICAgICAgICAgICAgIHNlbGYuX2RpZEZhaWwoJ0NvdWxkIG5vdCBjcmVhdGUgZG93bmxvYWQgZGlyZWN0b3J5Jyk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIENvcHkgZG93bmxvYWRlZCBhc3NldCBtYW5pZmVzdCB0byBmaWxlLlxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oc2VsZi5fZG93bmxvYWREaXJlY3RvcnksICdwcm9ncmFtLmpzb24nKSwgYm9keSk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgICAgIHNlbGYuX2RpZEZhaWwoZS5tZXNzYWdlKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzZWxmLl9sLmxvZygnZGVidWcnLCAnTWFuaWZlc3QgY29waWVkIHRvIG5ldyBEb3dubG9hZCBkaXInKTtcclxuXHJcblxyXG4gICAgICAgICAgICBhc3NldEJ1bmRsZSA9IG51bGw7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBhc3NldEJ1bmRsZSA9IG5ldyBBc3NldEJ1bmRsZShcclxuICAgICAgICAgICAgICAgICAgICBzZWxmLl9sLmdldFVud3JhcHBlZExvZ2dlcigpLFxyXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2Rvd25sb2FkRGlyZWN0b3J5LFxyXG4gICAgICAgICAgICAgICAgICAgIG1hbmlmZXN0LFxyXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2luaXRpYWxBc3NldEJ1bmRsZVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgc2VsZi5fZGlkRmFpbChlLm1lc3NhZ2UpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBzZWxmLl9kb3dubG9hZEFzc2V0QnVuZGxlKGFzc2V0QnVuZGxlLCBiYXNlVXJsKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBzZWxmLl9kaWRGYWlsKCdFcnJvciBkb3dubG9hZGluZyBhc3NldCBtYW5pZmVzdDogJyArIGVycm9yKTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZW1vdmVzIHVubmVjZXNzYXJ5IHZlcnNpb25zLlxyXG4gKlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvblRvS2VlcFxyXG4gKi9cclxuQXNzZXRCdW5kbGVNYW5hZ2VyLnByb3RvdHlwZS5yZW1vdmVBbGxEb3dubG9hZGVkQXNzZXRCdW5kbGVzRXhjZXB0Rm9yVmVyc2lvbiA9XHJcbiAgICBmdW5jdGlvbiByZW1vdmVBbGxEb3dubG9hZGVkQXNzZXRCdW5kbGVzRXhjZXB0Rm9yVmVyc2lvbih2ZXJzaW9uVG9LZWVwKSB7XHJcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgICAgIE9iamVjdC5rZXlzKHRoaXMuX2Rvd25sb2FkZWRBc3NldEJ1bmRsZXNCeVZlcnNpb24pLmZvckVhY2goXHJcblxyXG4gICAgICAgICAgICBmdW5jdGlvbiBlYWNoVmVyc2lvbihhc3NldFZlcnNpb24pIHtcclxuICAgICAgICAgICAgICAgIHZhciBhc3NldEJ1bmRsZSA9IHNlbGYuX2Rvd25sb2FkZWRBc3NldEJ1bmRsZXNCeVZlcnNpb25bYXNzZXRWZXJzaW9uXTtcclxuICAgICAgICAgICAgICAgIHZhciB2ZXJzaW9uID0gYXNzZXRCdW5kbGUuZ2V0VmVyc2lvbigpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmICh2ZXJzaW9uICE9PSB2ZXJzaW9uVG9LZWVwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2hlbGwucm0oJy1yZicsIHBhdGguam9pbihzZWxmLl92ZXJzaW9uc0RpcmVjdG9yeSwgdmVyc2lvbikpO1xyXG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBzZWxmLl9kb3dubG9hZGVkQXNzZXRCdW5kbGVzQnlWZXJzaW9uW3ZlcnNpb25dO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgIH07XHJcblxyXG4vKipcclxuICogQ3JlYXRlcyBEb3dubG9hZCBkaXJlY3RvcnkuXHJcbiAqXHJcbiAqIEByZXR1cm5zIHtib29sZWFufVxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuQXNzZXRCdW5kbGVNYW5hZ2VyLnByb3RvdHlwZS5fbWFrZURvd25sb2FkRGlyZWN0b3J5ID0gZnVuY3Rpb24gX21ha2VEb3dubG9hZERpcmVjdG9yeSgpIHtcclxuICAgIC8vIE1ha2Ugc2hlbGxKcyB0aHJvdyBvbiBmYWlsdXJlLlxyXG4gICAgc2hlbGxKc0NvbmZpZy5mYXRhbCA9IHRydWU7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIGlmICghZnMuZXhpc3RzU3luYyh0aGlzLl9kb3dubG9hZERpcmVjdG9yeSkpIHtcclxuICAgICAgICAgICAgdGhpcy5fbC5sb2coJ2luZm8nLCAnQ3JlYXRlZCBkb3dubG9hZCBkaXIuJyk7XHJcbiAgICAgICAgICAgIHNoZWxsLm1rZGlyKHRoaXMuX2Rvd25sb2FkRGlyZWN0b3J5KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgc2hlbGxKc0NvbmZpZy5mYXRhbCA9IGZhbHNlO1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIHRoaXMuX2wubG9nKCdkZWJ1ZycsICdDcmVhdGluZyBkb3dubG9hZCBkaXIgZmFpbGVkOiAnICsgZS5tZXNzYWdlKTtcclxuICAgIH1cclxuICAgIHNoZWxsSnNDb25maWcuZmF0YWwgPSBmYWxzZTtcclxuICAgIHJldHVybiBmYWxzZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBMb2FkcyBhbGwgZG93bmxvYWRlZCBhc3NldCBidW5kbGVzLlxyXG4gKlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuQXNzZXRCdW5kbGVNYW5hZ2VyLnByb3RvdHlwZS5fbG9hZERvd25sb2FkZWRBc3NldEJ1bmRsZXMgPSBmdW5jdGlvbiBfbG9hZERvd25sb2FkZWRBc3NldEJ1bmRsZXMoKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgYXNzZXRCdW5kbGU7XHJcblxyXG4gICAgc2hlbGwubHMoJy1kJywgcGF0aC5qb2luKHRoaXMuX3ZlcnNpb25zRGlyZWN0b3J5LCAnKicpKS5mb3JFYWNoKGZ1bmN0aW9uIGVhY2hWZXJzaW9uRGlyKGZpbGUpIHtcclxuICAgICAgICBpZiAoc2VsZi5fZG93bmxvYWREaXJlY3RvcnkgIT09IHBhdGgubm9ybWFsaXplKGZpbGUpXHJcbiAgICAgICAgICAgICYmIHNlbGYuX3BhcnRpYWxEb3dubG9hZERpcmVjdG9yeSAhPT0gcGF0aC5ub3JtYWxpemUoZmlsZSlcclxuICAgICAgICAgICAgJiYgZnMubHN0YXRTeW5jKGZpbGUpLmlzRGlyZWN0b3J5KClcclxuICAgICAgICApIHtcclxuICAgICAgICAgICAgYXNzZXRCdW5kbGUgPSBuZXcgQXNzZXRCdW5kbGUoXHJcbiAgICAgICAgICAgICAgICBzZWxmLl9sLmdldFVud3JhcHBlZExvZ2dlcigpLFxyXG4gICAgICAgICAgICAgICAgZmlsZSxcclxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgIHNlbGYuX2luaXRpYWxBc3NldEJ1bmRsZVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBzZWxmLl9sLmxvZygnaW5mbycsICdHb3QgdmVyc2lvbjogJyArIGFzc2V0QnVuZGxlLmdldFZlcnNpb24oKSArICcgaW4gJyArIGZpbGUpO1xyXG4gICAgICAgICAgICBzZWxmLl9kb3dubG9hZGVkQXNzZXRCdW5kbGVzQnlWZXJzaW9uW2Fzc2V0QnVuZGxlLmdldFZlcnNpb24oKV0gPSBhc3NldEJ1bmRsZTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBGYWlsdXJlIGhhbmRsZXIuXHJcbiAqXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBjYXVzZSAtIEVycm9yIG1lc3NhZ2UuXHJcbiAqIEBwcml2YXRlXHJcbiAqL1xyXG5Bc3NldEJ1bmRsZU1hbmFnZXIucHJvdG90eXBlLl9kaWRGYWlsID0gZnVuY3Rpb24gX2RpZEZhaWwoY2F1c2UpIHtcclxuICAgIHRoaXMuX2Fzc2V0QnVuZGxlRG93bmxvYWRlciA9IG51bGw7XHJcbiAgICB0aGlzLl9sLmxvZygnZGVidWcnLCAnRmFpbDogJyArIGNhdXNlKTtcclxuXHJcbiAgICBpZiAodGhpcy5fY2FsbGJhY2sgIT09IG51bGwpIHtcclxuICAgICAgICB0aGlzLl9jYWxsYmFjay5vbkVycm9yKGNhdXNlKTtcclxuICAgIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBTdWNjZXNzIGhhbmRsZXIuXHJcbiAqXHJcbiAqIEBwYXJhbSB7QXNzZXRCdW5kbGV9IGFzc2V0QnVuZGxlIC0gQXNzZXQgYnVuZGxlIHdoaWNoIHdhcyBkb3dubG9hZGVkLlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuQXNzZXRCdW5kbGVNYW5hZ2VyLnByb3RvdHlwZS5fZGlkRmluaXNoRG93bmxvYWRpbmdBc3NldEJ1bmRsZSA9XHJcbiAgICBmdW5jdGlvbiBfZGlkRmluaXNoRG93bmxvYWRpbmdBc3NldEJ1bmRsZShhc3NldEJ1bmRsZSkge1xyXG4gICAgICAgIHRoaXMuX2Fzc2V0QnVuZGxlRG93bmxvYWRlciA9IG51bGw7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLl9jYWxsYmFjayAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aGlzLl9jYWxsYmFjay5vbkZpbmlzaGVkRG93bmxvYWRpbmdBc3NldEJ1bmRsZShhc3NldEJ1bmRsZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcblxyXG4vKipcclxuICogU2VhcmNoZXMgZm9yIGEgY2FjaGVkIGFzc2V0IGluIGFsbCBhdmFpbGFibGUgYnVuZGxlcy5cclxuICpcclxuICogQHBhcmFtIHtBc3NldH0gYXNzZXQgLSBBc3NldCB3ZSBhcmUgc2VhcmNoaW5nIGZvci5cclxuICogQHJldHVybnMge0Fzc2V0fG51bGx9XHJcbiAqIEBwcml2YXRlXHJcbiAqL1xyXG5Bc3NldEJ1bmRsZU1hbmFnZXIucHJvdG90eXBlLl9jYWNoZWRBc3NldEZvckFzc2V0ID0gZnVuY3Rpb24gX2NhY2hlZEFzc2V0Rm9yQXNzZXQoYXNzZXQpIHtcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIHZhciBhc3NldEJ1bmRsZUtleTtcclxuICAgIHZhciBhc3NldEJ1bmRsZTtcclxuXHJcbiAgICB2YXIgYnVuZGxlcyA9IE9iamVjdC5rZXlzKHRoaXMuX2Rvd25sb2FkZWRBc3NldEJ1bmRsZXNCeVZlcnNpb24pLnJlZHVjZShcclxuICAgICAgICBmdW5jdGlvbiByZWR1Y2VCdW5kbGVzKGFyciwga2V5KSB7XHJcbiAgICAgICAgICAgIGFyci5wdXNoKHNlbGYuX2Rvd25sb2FkZWRBc3NldEJ1bmRsZXNCeVZlcnNpb25ba2V5XSk7XHJcbiAgICAgICAgICAgIHJldHVybiBhcnI7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBbXVxyXG4gICAgKTtcclxuXHJcbiAgICB2YXIgY2FjaGVkQXNzZXQ7XHJcbiAgICBmb3IgKGFzc2V0QnVuZGxlS2V5IGluIGJ1bmRsZXMpIHtcclxuICAgICAgICBpZiAoYnVuZGxlcy5oYXNPd25Qcm9wZXJ0eShhc3NldEJ1bmRsZUtleSkpIHtcclxuICAgICAgICAgICAgYXNzZXRCdW5kbGUgPSBidW5kbGVzW2Fzc2V0QnVuZGxlS2V5XTtcclxuICAgICAgICAgICAgY2FjaGVkQXNzZXQgPSBhc3NldEJ1bmRsZS5jYWNoZWRBc3NldEZvclVybFBhdGgoYXNzZXQudXJsUGF0aCwgYXNzZXQuaGFzaCk7XHJcbiAgICAgICAgICAgIGlmIChjYWNoZWRBc3NldCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhY2hlZEFzc2V0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLl9wYXJ0aWFsbHlEb3dubG9hZGVkQXNzZXRCdW5kbGUgIT09IG51bGwpIHtcclxuICAgICAgICBjYWNoZWRBc3NldCA9XHJcbiAgICAgICAgICAgIHRoaXMuX3BhcnRpYWxseURvd25sb2FkZWRBc3NldEJ1bmRsZS5jYWNoZWRBc3NldEZvclVybFBhdGgoYXNzZXQudXJsUGF0aCwgYXNzZXQuaGFzaCk7XHJcblxyXG4gICAgICAgIC8vIE1ha2Ugc3VyZSB0aGUgYXNzZXQgaGFzIGJlZW4gZG93bmxvYWRlZC5cclxuICAgICAgICBpZiAoY2FjaGVkQXNzZXQgIT09IG51bGwgJiYgZnMuZXhpc3RzU3luYyhjYWNoZWRBc3NldC5nZXRGaWxlKCkpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRBc3NldDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn07XHJcblxyXG4vKipcclxuICogUHJlcGFyZWFzIGFzc2V0IGJ1bmRsZSBkb3dubG9hZGVyLlxyXG4gKlxyXG4gKiBAcGFyYW0ge0Fzc2V0QnVuZGxlfSBhc3NldEJ1bmRsZSAtIEFzc2V0IGJ1bmRsZSB0byBkb3dubG9hZC5cclxuICogQHBhcmFtIHtzdHJpbmd9ICAgICAgYmFzZVVybCAgICAgLSBVcmwgdG8gbWV0ZW9yIHNlcnZlci5cclxuICogQHByaXZhdGVcclxuICovXHJcbkFzc2V0QnVuZGxlTWFuYWdlci5wcm90b3R5cGUuX2Rvd25sb2FkQXNzZXRCdW5kbGUgPVxyXG4gICAgZnVuY3Rpb24gX2Rvd25sb2FkQXNzZXRCdW5kbGUoYXNzZXRCdW5kbGUsIGJhc2VVcmwpIHtcclxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICAgICAgdmFyIGNhY2hlZEFzc2V0O1xyXG4gICAgICAgIHZhciBhc3NldEJ1bmRsZURvd25sb2FkZXI7XHJcbiAgICAgICAgdmFyIG1pc3NpbmdBc3NldHMgPSBbXTtcclxuXHJcbiAgICAgICAgYXNzZXRCdW5kbGUuZ2V0T3duQXNzZXRzKCkuZm9yRWFjaChmdW5jdGlvbiBvd25Bc3NldChhc3NldCkge1xyXG4gICAgICAgICAgICAvLyBDcmVhdGUgY29udGFpbmluZyBkaXJlY3RvcmllcyBmb3IgdGhlIGFzc2V0IGlmIG5lY2Vzc2FyeVxyXG5cclxuICAgICAgICAgICAgdmFyIGNvbnRhaW5pbmdEaXJlY3RvcnkgPSBwYXRoLmRpcm5hbWUoYXNzZXQuZ2V0RmlsZSgpKTtcclxuXHJcbiAgICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhjb250YWluaW5nRGlyZWN0b3J5KSkge1xyXG4gICAgICAgICAgICAgICAgc2hlbGxKc0NvbmZpZy5mYXRhbCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNoZWxsLm1rZGlyKCctcCcsIGNvbnRhaW5pbmdEaXJlY3RvcnkpO1xyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2RpZEZhaWwoJ0NvdWxkIG5vdCBjcmVhdGUgY29udGFpbmluZyBkaXJlY3Rvcnk6ICcgKyBjb250YWluaW5nRGlyZWN0b3J5KTtcclxuICAgICAgICAgICAgICAgICAgICBzaGVsbEpzQ29uZmlnLmZhdGFsID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgc2hlbGxKc0NvbmZpZy5mYXRhbCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBJZiB3ZSBmaW5kIGEgY2FjaGVkIGFzc2V0LCB3ZSBjb3B5IGl0LlxyXG4gICAgICAgICAgICBjYWNoZWRBc3NldCA9IHNlbGYuX2NhY2hlZEFzc2V0Rm9yQXNzZXQoYXNzZXQpO1xyXG5cclxuICAgICAgICAgICAgaWYgKGNhY2hlZEFzc2V0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBzaGVsbEpzQ29uZmlnLmZhdGFsID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2hlbGwuY3AoY2FjaGVkQXNzZXQuZ2V0RmlsZSgpLCBhc3NldC5nZXRGaWxlKCkpO1xyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuX2RpZEZhaWwoZS5tZXNzYWdlKTtcclxuICAgICAgICAgICAgICAgICAgICBzaGVsbEpzQ29uZmlnLmZhdGFsID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgc2hlbGxKc0NvbmZpZy5mYXRhbCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgbWlzc2luZ0Fzc2V0cy5wdXNoKGFzc2V0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBJZiBhbGwgYXNzZXRzIHdlcmUgY2FjaGVkLCB0aGVyZSBpcyBubyBuZWVkIHRvIHN0YXJ0IGEgZG93bmxvYWRcclxuICAgICAgICBpZiAobWlzc2luZ0Fzc2V0cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgdGhpcy5fZGlkRmluaXNoRG93bmxvYWRpbmdBc3NldEJ1bmRsZShhc3NldEJ1bmRsZSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGFzc2V0QnVuZGxlRG93bmxvYWRlciA9IG5ldyBBc3NldEJ1bmRsZURvd25sb2FkZXIoXHJcbiAgICAgICAgICAgIHRoaXMuX2wuZ2V0VW53cmFwcGVkTG9nZ2VyKCksXHJcbiAgICAgICAgICAgIHRoaXMuX2NvbmZpZ3VyYXRpb24sXHJcbiAgICAgICAgICAgIGFzc2V0QnVuZGxlLFxyXG4gICAgICAgICAgICBiYXNlVXJsLFxyXG4gICAgICAgICAgICBtaXNzaW5nQXNzZXRzXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgYXNzZXRCdW5kbGVEb3dubG9hZGVyLnNldENhbGxiYWNrKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiBvbkZpbmlzaGVkKCkge1xyXG4gICAgICAgICAgICAgICAgYXNzZXRCdW5kbGVEb3dubG9hZGVyID0gbnVsbDtcclxuICAgICAgICAgICAgICAgIHNlbGYuX21vdmVEb3dubG9hZGVkQXNzZXRCdW5kbGVJbnRvUGxhY2UoYXNzZXRCdW5kbGUpO1xyXG4gICAgICAgICAgICAgICAgc2VsZi5fZGlkRmluaXNoRG93bmxvYWRpbmdBc3NldEJ1bmRsZShhc3NldEJ1bmRsZSk7XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIG9uRmFpbHVyZShjYXVzZSkge1xyXG4gICAgICAgICAgICAgICAgc2VsZi5fZGlkRmFpbChjYXVzZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIGFzc2V0QnVuZGxlRG93bmxvYWRlci5yZXN1bWUoKTtcclxuICAgIH07XHJcblxyXG4vKipcclxuICogTW92ZSB0aGUgZG93bmxvYWRlZCBhc3NldCBidW5kbGUgdG8gYSBuZXcgZGlyZWN0b3J5IG5hbWVkIGFmdGVyIHRoZSB2ZXJzaW9uLlxyXG4gKlxyXG4gKiBAcGFyYW0ge0Fzc2V0QnVuZGxlfSBhc3NldEJ1bmRsZSAtIEFzc2V0IGJ1bmRsZSB0byBtb3ZlLlxyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuQXNzZXRCdW5kbGVNYW5hZ2VyLnByb3RvdHlwZS5fbW92ZURvd25sb2FkZWRBc3NldEJ1bmRsZUludG9QbGFjZSA9XHJcbiAgICBmdW5jdGlvbiBfbW92ZURvd25sb2FkZWRBc3NldEJ1bmRsZUludG9QbGFjZShhc3NldEJ1bmRsZSkge1xyXG4gICAgICAgIHZhciB2ZXJzaW9uID0gYXNzZXRCdW5kbGUuZ2V0VmVyc2lvbigpO1xyXG4gICAgICAgIHZhciB2ZXJzaW9uRGlyZWN0b3J5ID0gcGF0aC5qb2luKHRoaXMuX3ZlcnNpb25zRGlyZWN0b3J5LCB2ZXJzaW9uKTtcclxuICAgICAgICBzaGVsbC5tdih0aGlzLl9kb3dubG9hZERpcmVjdG9yeSwgdmVyc2lvbkRpcmVjdG9yeSk7XHJcbiAgICAgICAgYXNzZXRCdW5kbGUuZGlkTW92ZVRvRGlyZWN0b3J5QXRVcmkodmVyc2lvbkRpcmVjdG9yeSk7XHJcbiAgICAgICAgdGhpcy5fZG93bmxvYWRlZEFzc2V0QnVuZGxlc0J5VmVyc2lvblt2ZXJzaW9uXSA9IGFzc2V0QnVuZGxlO1xyXG4gICAgfTtcclxuXHJcbi8qKlxyXG4gKiBJZiB0aGVyZSBpcyBhbiBleGlzdGluZyBEb3dubG9hZGluZyBkaXJlY3RvcnksIG1vdmUgaXRcclxuICogdG8gUGFydGlhbERvd25sb2FkIGFuZCBsb2FkIHRoZSBwYXJ0aWFsbHlEb3dubG9hZGVkQXNzZXRCdW5kbGUgc28gd2VcclxuICogZG9uJ3QgdW5uZWNlc3NhcmlseSByZWRvd25sb2FkIGFzc2V0cy5cclxuICpcclxuICogQHByaXZhdGVcclxuICovXHJcbkFzc2V0QnVuZGxlTWFuYWdlci5wcm90b3R5cGUuX21vdmVFeGlzdGluZ0Rvd25sb2FkRGlyZWN0b3J5SWZOZWVkZWQgPVxyXG4gICAgZnVuY3Rpb24gX21vdmVFeGlzdGluZ0Rvd25sb2FkRGlyZWN0b3J5SWZOZWVkZWQoKSB7XHJcbiAgICAgICAgc2hlbGxKc0NvbmZpZy5mYXRhbCA9IHRydWU7XHJcblxyXG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHRoaXMuX2Rvd25sb2FkRGlyZWN0b3J5KSkge1xyXG4gICAgICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyh0aGlzLl9wYXJ0aWFsRG93bmxvYWREaXJlY3RvcnkpKSB7XHJcbiAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNoZWxsLnJtKCctUmYnLCB0aGlzLl9wYXJ0aWFsRG93bmxvYWREaXJlY3RvcnkpO1xyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2wubG9nKCdlcnJvcicsICdDb3VsZCBub3QgZGVsZXRlIHBhcnRpYWwgZG93bmxvYWQgZGlyZWN0b3J5LicpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLl9wYXJ0aWFsbHlEb3dubG9hZGVkQXNzZXRCdW5kbGUgPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIHNoZWxsLm12KHRoaXMuX2Rvd25sb2FkRGlyZWN0b3J5LCB0aGlzLl9wYXJ0aWFsRG93bmxvYWREaXJlY3RvcnkpO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9sLmxvZygnZXJyb3InLCAnQ291bGQgbm90IHJlbmFtZSBleGlzdGluZyBkb3dubG9hZCBkaXJlY3RvcnknKTtcclxuICAgICAgICAgICAgICAgIHNoZWxsSnNDb25maWcuZmF0YWwgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuX3BhcnRpYWxseURvd25sb2FkZWRBc3NldEJ1bmRsZSA9XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IEFzc2V0QnVuZGxlKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9sLmdldFVud3JhcHBlZExvZ2dlcigpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wYXJ0aWFsRG93bmxvYWREaXJlY3RvcnksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5faW5pdGlhbEFzc2V0QnVuZGxlXHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fbC5sb2coJ3dhcm4nLCAnQ291bGQgbm90IGxvYWQgcGFydGlhbGx5IGRvd25sb2FkZWQgYXNzZXQgYnVuZGxlLicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHNoZWxsSnNDb25maWcuZmF0YWwgPSBmYWxzZTtcclxuICAgIH07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFzc2V0QnVuZGxlTWFuYWdlcjtcclxuIl0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9
