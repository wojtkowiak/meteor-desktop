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
 /cordova-plugin-meteor-webapp/blob/master/src/android/AssetBundleDownloader.java

 */

var fs = require('fs');
var request = require('request');
var url = require('url');
var queue = require('queue');
var Log = require('./logger');

/**
 * Assets downloader - responsible for downloading an asset version.
 *
 * @param {object}      l             - Logger instance.
 * @param {object}      configuration - Configuration object.
 * @param {AssetBundle} assetBundle   - Parent asset bundle.
 * @param {string}      baseUrl       - Url of the meteor server.
 * @param {[Asset]}     missingAssets - Array of assets to download.
 * @constructor
 */
function AssetBundleDownloader(l, configuration, assetBundle, baseUrl, missingAssets) {
    this._l = l.clone('AssetBundleDownloader');
    this._l.debug('AssetBundle downloader created for ' + assetBundle.directoryUri);

    this._configuration = configuration;
    this._assetBundle = assetBundle;
    this._baseUrl = baseUrl;

    this._httpClient = request;

    this._eTagWithSha1HashPattern = new RegExp('"([0-9a-f]{40})"');

    this._missingAssets = missingAssets;
    this._assetsDownloading = [];
    this._onFinished = null;
    this._onFailure = null;
    this._cancel = false;

    this._q = queue();
}

/**
 * Asset bundle getter.
 */
AssetBundleDownloader.prototype.getAssetBundle = function getAssetBundle() {
    return this._assetBundle;
};

/**
 * Stores callbacks.
 *
 * @param {function} onFinished - Callback for success.
 * @param {function} onFailure  - Callback for failure.
 */
AssetBundleDownloader.prototype.setCallback = function setCallback(onFinished, onFailure) {
    this._onFinished = onFinished;
    this._onFailure = onFailure;
};

/**
 * Starts the download.
 */
AssetBundleDownloader.prototype.resume = function resume() {
    var self = this;

    this._l.debug(
        'Start downloading assets from bundle with version: ' + this._assetBundle.getVersion()
    );

    /**
     * @param {Asset} asset
     * @param {string} cause
     */
    function onFailure(asset, cause) {
        self._assetsDownloading.splice(self._assetsDownloading.indexOf(asset), 1);

        if (!self._cancel) {
            self._didFail('Error downloading asset: ' + asset.filePath + ': ' + cause);
        }
    }

    function onResponse(asset, response, body) {
        var runtimeConfig;

        self._assetsDownloading.splice(self._assetsDownloading.indexOf(asset), 1);

        try {
            self._verifyResponse(response, asset, body);
        } catch (e) {
            self._didFail(e.message);
            return;
        }

        try {
            fs.writeFileSync(asset.getFile(), body);
        } catch (e) {
            self._didFail(e.message);
            return;
        }

        // We don't have a hash for the index page, so we have to parse the runtime config
        // and compare autoupdateVersionCordova to the version in the manifest to verify
        // if we downloaded the expected version.
        if (asset.filePath === 'index.html') {
            runtimeConfig = self._assetBundle.getRuntimeConfig();
            if (runtimeConfig !== null) {
                try {
                    self._verifyRuntimeConfig(runtimeConfig);
                } catch (e) {
                    self._didFail(e);
                    return;
                }
            }
        }

        self._missingAssets.splice(self._missingAssets.indexOf(asset), 1);

        if (self._missingAssets.length === 0) {
            self._l.debug(
                'Finished downloading new asset bundle version: ' + self._assetBundle.getVersion()
            );

            if (self._onFinished) {
                self._onFinished();
            }
        }
    }

    this._missingAssets.forEach(function eachAsset(asset) {
        var downloadUrl;
        if (!~self._assetsDownloading.indexOf(asset)) {
            self._assetsDownloading.push(asset);
            downloadUrl = self._downloadUrlForAsset(asset);

            self._q.push(function downloadFile(callback) {
                self._httpClient(
                    { uri: downloadUrl, encoding: null },
                    function httpResult(error, response, body) {
                        if (!error) {
                            onResponse(asset, response, body);
                        } else {
                            onFailure(asset, error);
                        }
                        callback();
                    });
            });
        }
    });
    self._q.start();
};

/**
 * Cancels downloading.
 */
AssetBundleDownloader.prototype.cancel = function cancel() {
    this._cancel = true;
    this._q.end();
};

/**
 * Computes a download url for asset.
 *
 * @param {Asset} asset - Asset for which the url is created.
 * @returns {string}
 * @private
 */
AssetBundleDownloader.prototype._downloadUrlForAsset = function _downloadUrlForAsset(asset) {
    var builder;
    var urlPath = asset.urlPath;

    // Remove leading / from URL path because the path should be
    // interpreted relative to the base URL
    if (urlPath[0] === '/') {
        urlPath = urlPath.substring(1);
    }

    builder = url.parse(url.resolve(this._baseUrl, urlPath));

    // To avoid inadvertently downloading the default index page when an asset
    // is not found, we add meteor_dont_serve_index=true to the URL unless we
    // are actually downloading the index page.
    if (asset.filePath !== 'index.html') {
        builder.query = { meteor_dont_serve_index: 'true' };
    }

    return url.format(builder);
};

/**
 * Versifies response from the server.
 *
 * @param {Object} response - Http response object.
 * @param {Asset}  asset    - Asset which was downloaded.
 * @param {Buffer} body     - Body of the file as a Buffer.
 * @private
 */
AssetBundleDownloader.prototype._verifyResponse = function _verifyResponse(response, asset, body) {
    var expectedHash;
    var eTag;
    var matches;
    var actualHash;

    if (response.statusCode !== 200) {
        throw new Error(
            'Non-success status code ' + response.statusCode + ' for asset: ' + asset.filePath
        );
    }

    // If we have a hash for the asset, and the ETag header also specifies
    // a hash, we compare these to verify if we received the expected asset version.
    expectedHash = asset.hash;

    if (expectedHash !== null) {
        eTag = response.headers.etag;

        if (eTag !== null) {
            matches = eTag.match(this._eTagWithSha1HashPattern);

            if (this._eTagWithSha1HashPattern.test(eTag)) {
                actualHash = matches[1];

                if (actualHash !== expectedHash) {
                    throw new Error(
                        'Hash mismatch for asset: ' + asset.filePath + ' Expected hash:'
                        + expectedHash + ' != ' + actualHash
                    );
                } else {
                    if (asset.entrySize !== body.length) {
                        // TODO: should we fail here?
                        this._l.debug('Wrong size for :' + asset.filePath + ' Expected: '
                            + asset.entrySize + ' != ' + body.length);
                    }
                }
            } else {
                this._l.warn(`invalid etag format for ${asset.urlPath}: ${eTag}`);
            }
        } else {
            this._l.warn(`no eTag served for ${asset.urlPath}`);
        }
    }
};

/**
 * Fail handler.
 *
 * @param {string} cause - Error message;
 * @private
 */
AssetBundleDownloader.prototype._didFail = function _didFail(cause) {
    if (this._cancel) return;

    this.cancel();

    this._l.debug('Failure: ' + cause);
    if (this._onFailure !== null) {
        this._onFailure(cause);
    }
};


/**
 * Verifies runtime config.
 *
 * @param {Object} runtimeConfig - Runtime config.
 * @private
 */
AssetBundleDownloader.prototype._verifyRuntimeConfig =
    function _verifyRuntimeConfig(runtimeConfig) {
        var rootUrlString;
        var rootUrl;
        var previousRootUrl;
        var appId;

        var expectedVersion = this._assetBundle.getVersion();
        var actualVersion = runtimeConfig.autoupdateVersionCordova;

        if (actualVersion) {
            if (actualVersion !== expectedVersion) {
                throw new Error(
                    'Version mismatch for index page, expected: ' + expectedVersion +
                    ', actual: ' + actualVersion);
            }
        }

        if (!('ROOT_URL' in runtimeConfig)) {
            throw new Error('Could not find ROOT_URL in downloaded asset bundle');
        }

        rootUrlString = runtimeConfig.ROOT_URL;

        rootUrl = url.parse(rootUrlString);
        previousRootUrl = url.parse(this._configuration.rootUrlString);

        if (previousRootUrl.host !== 'localhost' && rootUrl.host === 'localhost') {
            throw new Error(
                'ROOT_URL in downloaded asset bundle would change current ROOT_URL ' +
                ' to localhost. Make sure ROOT_URL has been configured correctly on the server.'
            );
        }

        if (!('appId' in runtimeConfig)) {
            throw new Error('Could not find appId in downloaded asset bundle.');
        }

        appId = runtimeConfig.appId;

        if (appId !== this._configuration.appId) {
            throw new Error(
                'appId in downloaded asset bundle does not match current appId. Make sure the' +
                ' server at ' + rootUrlString + ' is serving the right app.'
            );
        }
    };

module.exports = AssetBundleDownloader;
