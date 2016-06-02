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
    this._l = new Log('AssetBundleDownloader', l);
    this._l.log('debug', 'AssetBundle downloader created for ' + assetBundle.directoryUri);

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

    this._l.log('debug', 'Start downloading assets from bundle with version: ' + this._assetBundle.getVersion());

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
            self._l.log('debug', 'Finished downloading new asset bundle version: ' + self._assetBundle.getVersion());

            if (self._onFinished) {
                self._onFinished();
            }
        }
    }

    this._missingAssets.forEach(function eachAsset(asset) {
        var downloadUrl;
        if (! ~self._assetsDownloading.indexOf(asset)) {
            self._assetsDownloading.push(asset);
            downloadUrl = self._downloadUrlForAsset(asset);

            self._q.push(function downloadFile(callback) {
                self._httpClient({ uri: downloadUrl, encoding: null }, function httpResult(error, response, body) {
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
        throw new Error('Non-success status code ' + response.statusCode + ' for asset: ' + asset.filePath);
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
                    throw new Error('Hash mismatch for asset: ' + asset.filePath + ' Expected hash:' + expectedHash + ' != ' + actualHash);
                } else {
                    if (asset.entrySize !== body.length) {
                        // TODO: should we fail here?
                        this._l.log('debug', 'Wrong size for :' + asset.filePath + ' Expected: ' + asset.entrySize + ' != ' + body.length);
                    }
                }
            }
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

    this._l.log('debug', 'Failure: ' + cause);
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
AssetBundleDownloader.prototype._verifyRuntimeConfig = function _verifyRuntimeConfig(runtimeConfig) {
    var rootUrlString;
    var rootUrl;
    var previousRootUrl;
    var appId;

    var expectedVersion = this._assetBundle.getVersion();
    var actualVersion = runtimeConfig.autoupdateVersionCordova;

    if (actualVersion) {
        if (actualVersion !== expectedVersion) {
            throw new Error('Version mismatch for index page, expected: ' + expectedVersion + ', actual: ' + actualVersion);
        }
    }

    if (!('ROOT_URL' in runtimeConfig)) {
        throw new Error('Could not find ROOT_URL in downloaded asset bundle');
    }

    rootUrlString = runtimeConfig.ROOT_URL;

    rootUrl = url.parse(rootUrlString);
    previousRootUrl = url.parse(this._configuration.rootUrlString);

    if (previousRootUrl.host !== 'localhost' && rootUrl.host === 'localhost') {
        throw new Error('ROOT_URL in downloaded asset bundle would change current ROOT_URL ' + ' to localhost. Make sure ROOT_URL has been configured correctly on the server.');
    }

    if (!('appId' in runtimeConfig)) {
        throw new Error('Could not find appId in downloaded asset bundle.');
    }

    appId = runtimeConfig.appId;

    if (appId !== this._configuration.appId) {
        throw new Error('appId in downloaded asset bundle does not match current appId. Make sure the' + ' server at ' + rootUrlString + ' is serving the right app.');
    }
};

module.exports = AssetBundleDownloader;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1vZHVsZXMvYXV0b3VwZGF0ZS9hc3NldEJ1bmRsZURvd25sb2FkZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQStCQSxJQUFJLEtBQUssUUFBUSxJQUFSLENBQVQ7QUFDQSxJQUFJLFVBQVUsUUFBUSxTQUFSLENBQWQ7QUFDQSxJQUFJLE1BQU0sUUFBUSxLQUFSLENBQVY7QUFDQSxJQUFJLFFBQVEsUUFBUSxPQUFSLENBQVo7QUFDQSxJQUFJLE1BQU0sUUFBUSxVQUFSLENBQVY7Ozs7Ozs7Ozs7OztBQVlBLFNBQVMscUJBQVQsQ0FBK0IsQ0FBL0IsRUFBa0MsYUFBbEMsRUFBaUQsV0FBakQsRUFBOEQsT0FBOUQsRUFBdUUsYUFBdkUsRUFBc0Y7QUFDbEYsU0FBSyxFQUFMLEdBQVUsSUFBSSxHQUFKLENBQVEsdUJBQVIsRUFBaUMsQ0FBakMsQ0FBVjtBQUNBLFNBQUssRUFBTCxDQUFRLEdBQVIsQ0FBWSxPQUFaLEVBQXFCLHdDQUF3QyxZQUFZLFlBQXpFOztBQUVBLFNBQUssY0FBTCxHQUFzQixhQUF0QjtBQUNBLFNBQUssWUFBTCxHQUFvQixXQUFwQjtBQUNBLFNBQUssUUFBTCxHQUFnQixPQUFoQjs7QUFFQSxTQUFLLFdBQUwsR0FBbUIsT0FBbkI7O0FBRUEsU0FBSyx3QkFBTCxHQUFnQyxJQUFJLE1BQUosQ0FBVyxrQkFBWCxDQUFoQzs7QUFFQSxTQUFLLGNBQUwsR0FBc0IsYUFBdEI7QUFDQSxTQUFLLGtCQUFMLEdBQTBCLEVBQTFCO0FBQ0EsU0FBSyxXQUFMLEdBQW1CLElBQW5CO0FBQ0EsU0FBSyxVQUFMLEdBQWtCLElBQWxCO0FBQ0EsU0FBSyxPQUFMLEdBQWUsS0FBZjs7QUFFQSxTQUFLLEVBQUwsR0FBVSxPQUFWO0FBQ0g7Ozs7O0FBS0Qsc0JBQXNCLFNBQXRCLENBQWdDLGNBQWhDLEdBQWlELFNBQVMsY0FBVCxHQUEwQjtBQUN2RSxXQUFPLEtBQUssWUFBWjtBQUNILENBRkQ7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S0FBbEMsRUFBeUM7QUFDckMsY0FBTSxJQUFJLEtBQUosQ0FDRixpRkFDQSxhQURBLEdBQ2dCLGFBRGhCLEdBQ2dDLDRCQUY5QixDQUFOO0FBSUg7QUFDSixDQTlDTDs7QUFnREEsT0FBTyxPQUFQLEdBQWlCLHFCQUFqQiIsImZpbGUiOiJtb2R1bGVzL2F1dG91cGRhdGUvYXNzZXRCdW5kbGVEb3dubG9hZGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiBUaGlzIGlzIGEgc2xpZ2h0bHkgbW9kaWZpZWQgSlMgcG9ydCBvZiBob3QgY29kZSBwdXNoIGFuZHJvaWQgY2xpZW50IGZyb20gaGVyZTpcclxuIGh0dHBzOi8vZ2l0aHViLmNvbS9tZXRlb3IvY29yZG92YS1wbHVnaW4tbWV0ZW9yLXdlYmFwcFxyXG5cclxuIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxyXG5cclxuIENvcHlyaWdodCAoYykgMjAxNSBNZXRlb3IgRGV2ZWxvcG1lbnQgR3JvdXBcclxuXHJcbiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XHJcbiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXHJcbiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXHJcbiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXHJcbiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcclxuIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XHJcblxyXG4gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXHJcbiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxyXG5cclxuIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcclxuIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxyXG4gRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXHJcbiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXHJcbiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxyXG4gT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcclxuIFNPRlRXQVJFLlxyXG5cclxuIFRoaXMgaXMgYmFzZWQgb246XHJcbiAvY29yZG92YS1wbHVnaW4tbWV0ZW9yLXdlYmFwcC9ibG9iL21hc3Rlci9zcmMvYW5kcm9pZC9Bc3NldEJ1bmRsZURvd25sb2FkZXIuamF2YVxyXG5cclxuICovXHJcblxyXG52YXIgZnMgPSByZXF1aXJlKCdmcycpO1xyXG52YXIgcmVxdWVzdCA9IHJlcXVpcmUoJ3JlcXVlc3QnKTtcclxudmFyIHVybCA9IHJlcXVpcmUoJ3VybCcpO1xyXG52YXIgcXVldWUgPSByZXF1aXJlKCdxdWV1ZScpO1xyXG52YXIgTG9nID0gcmVxdWlyZSgnLi9sb2dnZXInKTtcclxuXHJcbi8qKlxyXG4gKiBBc3NldHMgZG93bmxvYWRlciAtIHJlc3BvbnNpYmxlIGZvciBkb3dubG9hZGluZyBhbiBhc3NldCB2ZXJzaW9uLlxyXG4gKlxyXG4gKiBAcGFyYW0ge29iamVjdH0gICAgICBsICAgICAgICAgICAgIC0gTG9nZ2VyIGluc3RhbmNlLlxyXG4gKiBAcGFyYW0ge29iamVjdH0gICAgICBjb25maWd1cmF0aW9uIC0gQ29uZmlndXJhdGlvbiBvYmplY3QuXHJcbiAqIEBwYXJhbSB7QXNzZXRCdW5kbGV9IGFzc2V0QnVuZGxlICAgLSBQYXJlbnQgYXNzZXQgYnVuZGxlLlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gICAgICBiYXNlVXJsICAgICAgIC0gVXJsIG9mIHRoZSBtZXRlb3Igc2VydmVyLlxyXG4gKiBAcGFyYW0ge1tBc3NldF19ICAgICBtaXNzaW5nQXNzZXRzIC0gQXJyYXkgb2YgYXNzZXRzIHRvIGRvd25sb2FkLlxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIEFzc2V0QnVuZGxlRG93bmxvYWRlcihsLCBjb25maWd1cmF0aW9uLCBhc3NldEJ1bmRsZSwgYmFzZVVybCwgbWlzc2luZ0Fzc2V0cykge1xyXG4gICAgdGhpcy5fbCA9IG5ldyBMb2coJ0Fzc2V0QnVuZGxlRG93bmxvYWRlcicsIGwpO1xyXG4gICAgdGhpcy5fbC5sb2coJ2RlYnVnJywgJ0Fzc2V0QnVuZGxlIGRvd25sb2FkZXIgY3JlYXRlZCBmb3IgJyArIGFzc2V0QnVuZGxlLmRpcmVjdG9yeVVyaSk7XHJcblxyXG4gICAgdGhpcy5fY29uZmlndXJhdGlvbiA9IGNvbmZpZ3VyYXRpb247XHJcbiAgICB0aGlzLl9hc3NldEJ1bmRsZSA9IGFzc2V0QnVuZGxlO1xyXG4gICAgdGhpcy5fYmFzZVVybCA9IGJhc2VVcmw7XHJcblxyXG4gICAgdGhpcy5faHR0cENsaWVudCA9IHJlcXVlc3Q7XHJcblxyXG4gICAgdGhpcy5fZVRhZ1dpdGhTaGExSGFzaFBhdHRlcm4gPSBuZXcgUmVnRXhwKCdcIihbMC05YS1mXXs0MH0pXCInKTtcclxuXHJcbiAgICB0aGlzLl9taXNzaW5nQXNzZXRzID0gbWlzc2luZ0Fzc2V0cztcclxuICAgIHRoaXMuX2Fzc2V0c0Rvd25sb2FkaW5nID0gW107XHJcbiAgICB0aGlzLl9vbkZpbmlzaGVkID0gbnVsbDtcclxuICAgIHRoaXMuX29uRmFpbHVyZSA9IG51bGw7XHJcbiAgICB0aGlzLl9jYW5jZWwgPSBmYWxzZTtcclxuXHJcbiAgICB0aGlzLl9xID0gcXVldWUoKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEFzc2V0IGJ1bmRsZSBnZXR0ZXIuXHJcbiAqL1xyXG5Bc3NldEJ1bmRsZURvd25sb2FkZXIucHJvdG90eXBlLmdldEFzc2V0QnVuZGxlID0gZnVuY3Rpb24gZ2V0QXNzZXRCdW5kbGUoKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fYXNzZXRCdW5kbGU7XHJcbn07XHJcblxyXG4vKipcclxuICogU3RvcmVzIGNhbGxiYWNrcy5cclxuICpcclxuICogQHBhcmFtIHtmdW5jdGlvbn0gb25GaW5pc2hlZCAtIENhbGxiYWNrIGZvciBzdWNjZXNzLlxyXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBvbkZhaWx1cmUgIC0gQ2FsbGJhY2sgZm9yIGZhaWx1cmUuXHJcbiAqL1xyXG5Bc3NldEJ1bmRsZURvd25sb2FkZXIucHJvdG90eXBlLnNldENhbGxiYWNrID0gZnVuY3Rpb24gc2V0Q2FsbGJhY2sob25GaW5pc2hlZCwgb25GYWlsdXJlKSB7XHJcbiAgICB0aGlzLl9vbkZpbmlzaGVkID0gb25GaW5pc2hlZDtcclxuICAgIHRoaXMuX29uRmFpbHVyZSA9IG9uRmFpbHVyZTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBTdGFydHMgdGhlIGRvd25sb2FkLlxyXG4gKi9cclxuQXNzZXRCdW5kbGVEb3dubG9hZGVyLnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbiByZXN1bWUoKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgdGhpcy5fbC5sb2coXHJcbiAgICAgICAgJ2RlYnVnJyxcclxuICAgICAgICAnU3RhcnQgZG93bmxvYWRpbmcgYXNzZXRzIGZyb20gYnVuZGxlIHdpdGggdmVyc2lvbjogJyArIHRoaXMuX2Fzc2V0QnVuZGxlLmdldFZlcnNpb24oKVxyXG4gICAgKTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0XHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gY2F1c2VcclxuICAgICAqL1xyXG4gICAgZnVuY3Rpb24gb25GYWlsdXJlKGFzc2V0LCBjYXVzZSkge1xyXG4gICAgICAgIHNlbGYuX2Fzc2V0c0Rvd25sb2FkaW5nLnNwbGljZShzZWxmLl9hc3NldHNEb3dubG9hZGluZy5pbmRleE9mKGFzc2V0KSwgMSk7XHJcblxyXG4gICAgICAgIGlmICghc2VsZi5fY2FuY2VsKSB7XHJcbiAgICAgICAgICAgIHNlbGYuX2RpZEZhaWwoJ0Vycm9yIGRvd25sb2FkaW5nIGFzc2V0OiAnICsgYXNzZXQuZmlsZVBhdGggKyAnOiAnICsgY2F1c2UpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBvblJlc3BvbnNlKGFzc2V0LCByZXNwb25zZSwgYm9keSkge1xyXG4gICAgICAgIHZhciBydW50aW1lQ29uZmlnO1xyXG5cclxuICAgICAgICBzZWxmLl9hc3NldHNEb3dubG9hZGluZy5zcGxpY2Uoc2VsZi5fYXNzZXRzRG93bmxvYWRpbmcuaW5kZXhPZihhc3NldCksIDEpO1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBzZWxmLl92ZXJpZnlSZXNwb25zZShyZXNwb25zZSwgYXNzZXQsIGJvZHkpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgc2VsZi5fZGlkRmFpbChlLm1lc3NhZ2UpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGFzc2V0LmdldEZpbGUoKSwgYm9keSk7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBzZWxmLl9kaWRGYWlsKGUubWVzc2FnZSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFdlIGRvbid0IGhhdmUgYSBoYXNoIGZvciB0aGUgaW5kZXggcGFnZSwgc28gd2UgaGF2ZSB0byBwYXJzZSB0aGUgcnVudGltZSBjb25maWdcclxuICAgICAgICAvLyBhbmQgY29tcGFyZSBhdXRvdXBkYXRlVmVyc2lvbkNvcmRvdmEgdG8gdGhlIHZlcnNpb24gaW4gdGhlIG1hbmlmZXN0IHRvIHZlcmlmeVxyXG4gICAgICAgIC8vIGlmIHdlIGRvd25sb2FkZWQgdGhlIGV4cGVjdGVkIHZlcnNpb24uXHJcbiAgICAgICAgaWYgKGFzc2V0LmZpbGVQYXRoID09PSAnaW5kZXguaHRtbCcpIHtcclxuICAgICAgICAgICAgcnVudGltZUNvbmZpZyA9IHNlbGYuX2Fzc2V0QnVuZGxlLmdldFJ1bnRpbWVDb25maWcoKTtcclxuICAgICAgICAgICAgaWYgKHJ1bnRpbWVDb25maWcgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fdmVyaWZ5UnVudGltZUNvbmZpZyhydW50aW1lQ29uZmlnKTtcclxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBzZWxmLl9kaWRGYWlsKGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc2VsZi5fbWlzc2luZ0Fzc2V0cy5zcGxpY2Uoc2VsZi5fbWlzc2luZ0Fzc2V0cy5pbmRleE9mKGFzc2V0KSwgMSk7XHJcblxyXG4gICAgICAgIGlmIChzZWxmLl9taXNzaW5nQXNzZXRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICBzZWxmLl9sLmxvZyhcclxuICAgICAgICAgICAgICAgICdkZWJ1ZycsXHJcbiAgICAgICAgICAgICAgICAnRmluaXNoZWQgZG93bmxvYWRpbmcgbmV3IGFzc2V0IGJ1bmRsZSB2ZXJzaW9uOiAnICsgc2VsZi5fYXNzZXRCdW5kbGUuZ2V0VmVyc2lvbigpXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBpZiAoc2VsZi5fb25GaW5pc2hlZCkge1xyXG4gICAgICAgICAgICAgICAgc2VsZi5fb25GaW5pc2hlZCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuX21pc3NpbmdBc3NldHMuZm9yRWFjaChmdW5jdGlvbiBlYWNoQXNzZXQoYXNzZXQpIHtcclxuICAgICAgICB2YXIgZG93bmxvYWRVcmw7XHJcbiAgICAgICAgaWYgKCF+c2VsZi5fYXNzZXRzRG93bmxvYWRpbmcuaW5kZXhPZihhc3NldCkpIHtcclxuICAgICAgICAgICAgc2VsZi5fYXNzZXRzRG93bmxvYWRpbmcucHVzaChhc3NldCk7XHJcbiAgICAgICAgICAgIGRvd25sb2FkVXJsID0gc2VsZi5fZG93bmxvYWRVcmxGb3JBc3NldChhc3NldCk7XHJcblxyXG4gICAgICAgICAgICBzZWxmLl9xLnB1c2goZnVuY3Rpb24gZG93bmxvYWRGaWxlKGNhbGxiYWNrKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxmLl9odHRwQ2xpZW50KFxyXG4gICAgICAgICAgICAgICAgICAgIHsgdXJpOiBkb3dubG9hZFVybCwgZW5jb2Rpbmc6IG51bGwgfSxcclxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBodHRwUmVzdWx0KGVycm9yLCByZXNwb25zZSwgYm9keSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvblJlc3BvbnNlKGFzc2V0LCByZXNwb25zZSwgYm9keSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbkZhaWx1cmUoYXNzZXQsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIHNlbGYuX3Euc3RhcnQoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDYW5jZWxzIGRvd25sb2FkaW5nLlxyXG4gKi9cclxuQXNzZXRCdW5kbGVEb3dubG9hZGVyLnByb3RvdHlwZS5jYW5jZWwgPSBmdW5jdGlvbiBjYW5jZWwoKSB7XHJcbiAgICB0aGlzLl9jYW5jZWwgPSB0cnVlO1xyXG4gICAgdGhpcy5fcS5lbmQoKTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb21wdXRlcyBhIGRvd25sb2FkIHVybCBmb3IgYXNzZXQuXHJcbiAqXHJcbiAqIEBwYXJhbSB7QXNzZXR9IGFzc2V0IC0gQXNzZXQgZm9yIHdoaWNoIHRoZSB1cmwgaXMgY3JlYXRlZC5cclxuICogQHJldHVybnMge3N0cmluZ31cclxuICogQHByaXZhdGVcclxuICovXHJcbkFzc2V0QnVuZGxlRG93bmxvYWRlci5wcm90b3R5cGUuX2Rvd25sb2FkVXJsRm9yQXNzZXQgPSBmdW5jdGlvbiBfZG93bmxvYWRVcmxGb3JBc3NldChhc3NldCkge1xyXG4gICAgdmFyIGJ1aWxkZXI7XHJcbiAgICB2YXIgdXJsUGF0aCA9IGFzc2V0LnVybFBhdGg7XHJcblxyXG4gICAgLy8gUmVtb3ZlIGxlYWRpbmcgLyBmcm9tIFVSTCBwYXRoIGJlY2F1c2UgdGhlIHBhdGggc2hvdWxkIGJlXHJcbiAgICAvLyBpbnRlcnByZXRlZCByZWxhdGl2ZSB0byB0aGUgYmFzZSBVUkxcclxuICAgIGlmICh1cmxQYXRoWzBdID09PSAnLycpIHtcclxuICAgICAgICB1cmxQYXRoID0gdXJsUGF0aC5zdWJzdHJpbmcoMSk7XHJcbiAgICB9XHJcblxyXG4gICAgYnVpbGRlciA9IHVybC5wYXJzZSh1cmwucmVzb2x2ZSh0aGlzLl9iYXNlVXJsLCB1cmxQYXRoKSk7XHJcblxyXG4gICAgLy8gVG8gYXZvaWQgaW5hZHZlcnRlbnRseSBkb3dubG9hZGluZyB0aGUgZGVmYXVsdCBpbmRleCBwYWdlIHdoZW4gYW4gYXNzZXRcclxuICAgIC8vIGlzIG5vdCBmb3VuZCwgd2UgYWRkIG1ldGVvcl9kb250X3NlcnZlX2luZGV4PXRydWUgdG8gdGhlIFVSTCB1bmxlc3Mgd2VcclxuICAgIC8vIGFyZSBhY3R1YWxseSBkb3dubG9hZGluZyB0aGUgaW5kZXggcGFnZS5cclxuICAgIGlmIChhc3NldC5maWxlUGF0aCAhPT0gJ2luZGV4Lmh0bWwnKSB7XHJcbiAgICAgICAgYnVpbGRlci5xdWVyeSA9IHsgbWV0ZW9yX2RvbnRfc2VydmVfaW5kZXg6ICd0cnVlJyB9O1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB1cmwuZm9ybWF0KGJ1aWxkZXIpO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFZlcnNpZmllcyByZXNwb25zZSBmcm9tIHRoZSBzZXJ2ZXIuXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSAtIEh0dHAgcmVzcG9uc2Ugb2JqZWN0LlxyXG4gKiBAcGFyYW0ge0Fzc2V0fSAgYXNzZXQgICAgLSBBc3NldCB3aGljaCB3YXMgZG93bmxvYWRlZC5cclxuICogQHBhcmFtIHtCdWZmZXJ9IGJvZHkgICAgIC0gQm9keSBvZiB0aGUgZmlsZSBhcyBhIEJ1ZmZlci5cclxuICogQHByaXZhdGVcclxuICovXHJcbkFzc2V0QnVuZGxlRG93bmxvYWRlci5wcm90b3R5cGUuX3ZlcmlmeVJlc3BvbnNlID0gZnVuY3Rpb24gX3ZlcmlmeVJlc3BvbnNlKHJlc3BvbnNlLCBhc3NldCwgYm9keSkge1xyXG4gICAgdmFyIGV4cGVjdGVkSGFzaDtcclxuICAgIHZhciBlVGFnO1xyXG4gICAgdmFyIG1hdGNoZXM7XHJcbiAgICB2YXIgYWN0dWFsSGFzaDtcclxuXHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICAnTm9uLXN1Y2Nlc3Mgc3RhdHVzIGNvZGUgJyArIHJlc3BvbnNlLnN0YXR1c0NvZGUgKyAnIGZvciBhc3NldDogJyArIGFzc2V0LmZpbGVQYXRoXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiB3ZSBoYXZlIGEgaGFzaCBmb3IgdGhlIGFzc2V0LCBhbmQgdGhlIEVUYWcgaGVhZGVyIGFsc28gc3BlY2lmaWVzXHJcbiAgICAvLyBhIGhhc2gsIHdlIGNvbXBhcmUgdGhlc2UgdG8gdmVyaWZ5IGlmIHdlIHJlY2VpdmVkIHRoZSBleHBlY3RlZCBhc3NldCB2ZXJzaW9uLlxyXG4gICAgZXhwZWN0ZWRIYXNoID0gYXNzZXQuaGFzaDtcclxuXHJcbiAgICBpZiAoZXhwZWN0ZWRIYXNoICE9PSBudWxsKSB7XHJcbiAgICAgICAgZVRhZyA9IHJlc3BvbnNlLmhlYWRlcnMuZXRhZztcclxuXHJcbiAgICAgICAgaWYgKGVUYWcgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgbWF0Y2hlcyA9IGVUYWcubWF0Y2godGhpcy5fZVRhZ1dpdGhTaGExSGFzaFBhdHRlcm4pO1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMuX2VUYWdXaXRoU2hhMUhhc2hQYXR0ZXJuLnRlc3QoZVRhZykpIHtcclxuICAgICAgICAgICAgICAgIGFjdHVhbEhhc2ggPSBtYXRjaGVzWzFdO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChhY3R1YWxIYXNoICE9PSBleHBlY3RlZEhhc2gpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdIYXNoIG1pc21hdGNoIGZvciBhc3NldDogJyArIGFzc2V0LmZpbGVQYXRoICsgJyBFeHBlY3RlZCBoYXNoOidcclxuICAgICAgICAgICAgICAgICAgICAgICAgKyBleHBlY3RlZEhhc2ggKyAnICE9ICcgKyBhY3R1YWxIYXNoXHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0LmVudHJ5U2l6ZSAhPT0gYm9keS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogc2hvdWxkIHdlIGZhaWwgaGVyZT9cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbC5sb2coJ2RlYnVnJywgJ1dyb25nIHNpemUgZm9yIDonICsgYXNzZXQuZmlsZVBhdGggKyAnIEV4cGVjdGVkOiAnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICArIGFzc2V0LmVudHJ5U2l6ZSArICcgIT0gJyArIGJvZHkubGVuZ3RoKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn07XHJcblxyXG4vKipcclxuICogRmFpbCBoYW5kbGVyLlxyXG4gKlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gY2F1c2UgLSBFcnJvciBtZXNzYWdlO1xyXG4gKiBAcHJpdmF0ZVxyXG4gKi9cclxuQXNzZXRCdW5kbGVEb3dubG9hZGVyLnByb3RvdHlwZS5fZGlkRmFpbCA9IGZ1bmN0aW9uIF9kaWRGYWlsKGNhdXNlKSB7XHJcbiAgICBpZiAodGhpcy5fY2FuY2VsKSByZXR1cm47XHJcblxyXG4gICAgdGhpcy5jYW5jZWwoKTtcclxuXHJcbiAgICB0aGlzLl9sLmxvZygnZGVidWcnLCAnRmFpbHVyZTogJyArIGNhdXNlKTtcclxuICAgIGlmICh0aGlzLl9vbkZhaWx1cmUgIT09IG51bGwpIHtcclxuICAgICAgICB0aGlzLl9vbkZhaWx1cmUoY2F1c2UpO1xyXG4gICAgfVxyXG59O1xyXG5cclxuXHJcbi8qKlxyXG4gKiBWZXJpZmllcyBydW50aW1lIGNvbmZpZy5cclxuICpcclxuICogQHBhcmFtIHtPYmplY3R9IHJ1bnRpbWVDb25maWcgLSBSdW50aW1lIGNvbmZpZy5cclxuICogQHByaXZhdGVcclxuICovXHJcbkFzc2V0QnVuZGxlRG93bmxvYWRlci5wcm90b3R5cGUuX3ZlcmlmeVJ1bnRpbWVDb25maWcgPVxyXG4gICAgZnVuY3Rpb24gX3ZlcmlmeVJ1bnRpbWVDb25maWcocnVudGltZUNvbmZpZykge1xyXG4gICAgICAgIHZhciByb290VXJsU3RyaW5nO1xyXG4gICAgICAgIHZhciByb290VXJsO1xyXG4gICAgICAgIHZhciBwcmV2aW91c1Jvb3RVcmw7XHJcbiAgICAgICAgdmFyIGFwcElkO1xyXG5cclxuICAgICAgICB2YXIgZXhwZWN0ZWRWZXJzaW9uID0gdGhpcy5fYXNzZXRCdW5kbGUuZ2V0VmVyc2lvbigpO1xyXG4gICAgICAgIHZhciBhY3R1YWxWZXJzaW9uID0gcnVudGltZUNvbmZpZy5hdXRvdXBkYXRlVmVyc2lvbkNvcmRvdmE7XHJcblxyXG4gICAgICAgIGlmIChhY3R1YWxWZXJzaW9uKSB7XHJcbiAgICAgICAgICAgIGlmIChhY3R1YWxWZXJzaW9uICE9PSBleHBlY3RlZFZlcnNpb24pIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICAgICAgICAgICAgICAnVmVyc2lvbiBtaXNtYXRjaCBmb3IgaW5kZXggcGFnZSwgZXhwZWN0ZWQ6ICcgKyBleHBlY3RlZFZlcnNpb24gK1xyXG4gICAgICAgICAgICAgICAgICAgICcsIGFjdHVhbDogJyArIGFjdHVhbFZlcnNpb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoISgnUk9PVF9VUkwnIGluIHJ1bnRpbWVDb25maWcpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGZpbmQgUk9PVF9VUkwgaW4gZG93bmxvYWRlZCBhc3NldCBidW5kbGUnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJvb3RVcmxTdHJpbmcgPSBydW50aW1lQ29uZmlnLlJPT1RfVVJMO1xyXG5cclxuICAgICAgICByb290VXJsID0gdXJsLnBhcnNlKHJvb3RVcmxTdHJpbmcpO1xyXG4gICAgICAgIHByZXZpb3VzUm9vdFVybCA9IHVybC5wYXJzZSh0aGlzLl9jb25maWd1cmF0aW9uLnJvb3RVcmxTdHJpbmcpO1xyXG5cclxuICAgICAgICBpZiAocHJldmlvdXNSb290VXJsLmhvc3QgIT09ICdsb2NhbGhvc3QnICYmIHJvb3RVcmwuaG9zdCA9PT0gJ2xvY2FsaG9zdCcpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICAgICAgJ1JPT1RfVVJMIGluIGRvd25sb2FkZWQgYXNzZXQgYnVuZGxlIHdvdWxkIGNoYW5nZSBjdXJyZW50IFJPT1RfVVJMICcgK1xyXG4gICAgICAgICAgICAgICAgJyB0byBsb2NhbGhvc3QuIE1ha2Ugc3VyZSBST09UX1VSTCBoYXMgYmVlbiBjb25maWd1cmVkIGNvcnJlY3RseSBvbiB0aGUgc2VydmVyLidcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghKCdhcHBJZCcgaW4gcnVudGltZUNvbmZpZykpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZmluZCBhcHBJZCBpbiBkb3dubG9hZGVkIGFzc2V0IGJ1bmRsZS4nKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGFwcElkID0gcnVudGltZUNvbmZpZy5hcHBJZDtcclxuXHJcbiAgICAgICAgaWYgKGFwcElkICE9PSB0aGlzLl9jb25maWd1cmF0aW9uLmFwcElkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICAgICAgICAgICdhcHBJZCBpbiBkb3dubG9hZGVkIGFzc2V0IGJ1bmRsZSBkb2VzIG5vdCBtYXRjaCBjdXJyZW50IGFwcElkLiBNYWtlIHN1cmUgdGhlJyArXHJcbiAgICAgICAgICAgICAgICAnIHNlcnZlciBhdCAnICsgcm9vdFVybFN0cmluZyArICcgaXMgc2VydmluZyB0aGUgcmlnaHQgYXBwLidcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBc3NldEJ1bmRsZURvd25sb2FkZXI7XHJcbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
