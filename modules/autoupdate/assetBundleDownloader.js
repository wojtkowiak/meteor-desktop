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
 /cordova-plugin-meteor-webapp/blob/master/src/android/AssetBundleDownloader.java

 */

import fs from 'fs';
import url from 'url';
// TODO: maybe use node-fetch?
import request from 'request';
import queue from 'queue';

export default class AssetBundleDownloader {
    /**
     * Assets downloader - responsible for downloading an asset version.
     *
     * @param {object}      log           - Winston reference.
     * @param {object}      configuration - Configuration object.
     * @param {AssetBundle} assetBundle   - Parent asset bundle.
     * @param {string}      baseUrl       - Url of the meteor server.
     * @param {[Asset]}     missingAssets - Array of assets to download.
     * @constructor
     */
    constructor(log, configuration, assetBundle, baseUrl, missingAssets) {
        this.log = log.getLoggerFor('AssetBundleDownloader');
        this.log.debug(`downloader created for ${assetBundle.directoryUri}`);

        this.configuration = configuration;
        this.assetBundle = assetBundle;
        this.baseUrl = baseUrl;

        this.httpClient = request;

        this.eTagWithSha1HashPattern = new RegExp('"([0-9a-f]{40})"');

        this.missingAssets = missingAssets;
        this.assetsDownloading = [];
        this.onFinished = null;
        this.onFailure = null;
        this.cancelInvoked = false;

        this.queue = queue();
    }

    /**
     * Asset bundle getter.
     */
    getAssetBundle() {
        return this.assetBundle;
    }

    /**
     * Stores callbacks.
     *
     * @param {function} onFinished - Callback for success.
     * @param {function} onFailure  - Callback for failure.
     */
    setCallbacks(onFinished, onFailure) {
        this.onFinished = onFinished;
        this.onFailure = onFailure;
    }

    /**
     * Starts the download.
     */
    resume() {
        const self = this;

        this.log.verbose(
            `started downloading assets from bundle with version: ${this.assetBundle.getVersion()}`
        );

        /**
         * @param {Asset} asset  - Asset whose downloading failed.
         * @param {string} cause - The cause.
         */
        function onFailure(asset, cause) {
            self.assetsDownloading.splice(self.assetsDownloading.indexOf(asset), 1);

            if (!self.cancelInvoked) {
                self.didFail(`error downloading asset: ${asset.filePath}: ${cause}`);
            }
        }

        /**
         * @param {Asset} asset - Asset that was downloaded.
         * @param {Object} response - Response object from `request`.
         * @param {string} body - Body of downloaded the file.
         */
        function onResponse(asset, response, body) {
            self.assetsDownloading.splice(self.assetsDownloading.indexOf(asset), 1);

            try {
                self.verifyResponse(response, asset, body);
            } catch (e) {
                self.didFail(e.message);
                return;
            }

            try {
                fs.writeFileSync(asset.getFile(), body);
            } catch (e) {
                self.didFail(e.message);
                return;
            }

            // We don't have a hash for the index page, so we have to parse the runtime config
            // and compare autoupdateVersionCordova to the version in the manifest to verify
            // if we downloaded the expected version.
            if (asset.filePath === 'index.html') {
                const runtimeConfig = self.assetBundle.getRuntimeConfig();
                if (runtimeConfig !== null) {
                    try {
                        self.verifyRuntimeConfig(runtimeConfig);
                    } catch (e) {
                        self.didFail(e);
                        return;
                    }
                }
            }

            self.log.verbose(`saving ${asset.urlPath}`);

            self.missingAssets.splice(self.missingAssets.indexOf(asset), 1);

            if (self.missingAssets.length === 0) {
                self.log.verbose(
                    'finished downloading new asset bundle version:' +
                    `${self.assetBundle.getVersion()}`
                );

                if (self.onFinished) {
                    self.onFinished();
                }
            }
        }

        this.missingAssets.forEach(asset => {
            if (!~self.assetsDownloading.indexOf(asset)) {
                self.assetsDownloading.push(asset);
                const downloadUrl = self.downloadUrlForAsset(asset);
                self.queue.push(callback => {
                    self.httpClient(
                        { uri: downloadUrl, encoding: null },
                        (error, response, body) => {
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
        self.queue.start();
    }

    /**
     * Cancels downloading.
     */
    cancel() {
        this.cancelInvoked = true;
        this.queue.end();
    }

    /**
     * Computes a download url for asset.
     *
     * @param {Asset} asset - Asset for which the url is created.
     * @returns {string}
     * @private
     */
    downloadUrlForAsset(asset) {
        let urlPath = asset.urlPath;

        // Remove leading / from URL path because the path should be
        // interpreted relative to the base URL.
        if (urlPath[0] === '/') {
            urlPath = urlPath.substring(1);
        }

        const builder = url.parse(url.resolve(this.baseUrl, urlPath));

        // To avoid inadvertently downloading the default index page when an asset
        // is not found, we add meteor_dont_serve_index=true to the URL unless we
        // are actually downloading the index page.
        if (asset.filePath !== 'index.html') {
            builder.query = { meteor_dont_serve_index: 'true' };
        }

        return url.format(builder);
    }

    /**
     * Verifies response from the server.
     *
     * @param {Object} response - Http response object.
     * @param {Asset}  asset    - Asset which was downloaded.
     * @param {Buffer} body     - Body of the file as a Buffer.
     * @private
     */
    verifyResponse(response, asset, body) {
        if (response.statusCode !== 200) {
            throw new Error(
                `non-success status code ${response.statusCode} for asset: ${asset.filePath}`
            );
        }

        // If we have a hash for the asset, and the ETag header also specifies
        // a hash, we compare these to verify if we received the expected asset version.
        const expectedHash = asset.hash;

        if (expectedHash !== null) {
            const eTag = response.headers.etag;

            if (eTag !== null) {
                const matches = eTag.match(this.eTagWithSha1HashPattern);

                if (this.eTagWithSha1HashPattern.test(eTag)) {
                    const actualHash = matches[1];

                    if (actualHash !== expectedHash) {
                        throw new Error(
                            `hash mismatch for asset: ${asset.filePath} - expected hash:` +
                            `${expectedHash} != ${actualHash}`
                        );
                    } else {
                        if (asset.entrySize !== body.length) {
                            // This check is specific to this integration. It is not present in
                            // Cordova integration.
                            // For now will not throw here as it is accepted on Cordova.
                            this.log.debug(`wrong size for: ${asset.filePath} - expected: ` +
                                `${asset.entrySize} != ${body.length}`);
                        }
                    }
                } else {
                    this.log.warn(`invalid etag format for ${asset.urlPath}: ${eTag}`);
                }
            } else {
                this.log.warn(`no eTag served for ${asset.urlPath}`);
            }
        }
    }

    /**
     * Fail handler.
     *
     * @param {string} cause - Error message;
     * @private
     */
    didFail(cause) {
        if (this.cancelInvoked) return;

        this.cancel();

        this.log.debug(`failure: ${cause}`);
        if (this.onFailure !== null) {
            this.onFailure(cause);
        }
    }


    /**
     * Verifies runtime config.
     *
     * @param {Object} runtimeConfig - Runtime config.
     * @private
     */
    verifyRuntimeConfig(runtimeConfig) {
        const expectedVersion = this.assetBundle.getVersion();
        const actualVersion = runtimeConfig.autoupdateVersionCordova;

        if (actualVersion) {
            if (actualVersion !== expectedVersion) {
                throw new Error(
                    `version mismatch for index page, expected: ${expectedVersion}` +
                    `, actual: ${actualVersion}`);
            }
        }

        if (!('ROOT_URL' in runtimeConfig)) {
            throw new Error('could not find ROOT_URL in downloaded asset bundle');
        }

        const rootUrlString = runtimeConfig.ROOT_URL;

        const rootUrl = url.parse(rootUrlString);
        const previousRootUrl = url.parse(this.configuration.rootUrlString);

        if (previousRootUrl.hostname !== 'localhost' && rootUrl.hostname === 'localhost') {
            throw new Error(
                'ROOT_URL in downloaded asset bundle would change current ROOT_URL ' +
                'to localhost. Make sure ROOT_URL has been configured correctly on the server.'
            );
        }

        if (!('appId' in runtimeConfig)) {
            throw new Error('could not find appId in downloaded asset bundle.');
        }

        const appId = runtimeConfig.appId;

        if (appId !== this.configuration.appId) {
            throw new Error(
                'appId in downloaded asset bundle does not match current appId. Make sure the' +
                ` server at ${rootUrlString} is serving the right app.`
            );
        }
    }
}

module.exports = AssetBundleDownloader;
