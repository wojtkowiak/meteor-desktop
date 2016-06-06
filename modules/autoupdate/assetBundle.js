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
 /cordova-plugin-meteor-webapp/blob/master/src/android/AssetBundle.java

 */

var path = require('path');
var fs = require('fs');
var url = require('url');

var Log = require('./logger');
var AssetManifest = require('./assetManifest');

/**
 * Represent single asset in the bundle.
 *
 * @property {string} filePath
 * @property {string} urlPath
 * @property {string} fileType
 * @property {number} size
 * @property {bool}   cacheable
 * @property {string} hash
 * @property {string} sourceMapFilePath
 * @property {string} sourceMapUrlPath
 * @property {AssetBundle} bundle
 * @constructor
 */
function Asset(filePath, urlPath, fileType, cacheable, hash, sourceMapUrlPath, size, bundle) {
    this.filePath = filePath;
    this.urlPath = urlPath;
    this.fileType = fileType;
    this.cacheable = cacheable;
    this.hash = hash;
    this.entrySize = size;
    this.sourceMapUrlPath = sourceMapUrlPath;
    this.bundle = bundle;

    this.getFile = function getFile() {
        return path.join(this.bundle.directoryUri, filePath);
    };
}

/**
 * Represents assets bundle.
 *
 * @param {object}        l                 - Logger instance.
 * @param {string}        directoryUri      - Where the bundle lies in the file system.
 * @param {AssetManifest=} manifest          - Bundle's manifest.
 * @param {AssetBundle=}   parentAssetBundle - Parent asset bundle.
 * @constructor
 */
function AssetBundle(l, directoryUri, manifest, parentAssetBundle) {
    var self = this;
    var indexFile;

    this._l = new Log('AssetBundle', l);
    this._l.log('debug', 'Creating bundle object for ' + directoryUri);

    this.directoryUri = directoryUri;

    this._runtimeConfig = null;
    this._appId = null;
    this._rootUrlString = null;
    this._matcher = new RegExp(
        '__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\("([^"]*)"\\)\\)'
    );

    this._parentAssetBundle = parentAssetBundle;

    if (manifest === undefined) {
        this._l.log('debug', 'Loading my manifest from ' + directoryUri);
        this.manifest = this._loadAssetManifest();
    } else {
        this.manifest = manifest;
    }

    this._version = this.manifest.version;
    this.cordovaCompatibilityVersion = this.manifest.cordovaCompatibilityVersion;

    this._ownAssetsByURLPath = {};

    // Filter assets that are only in this bundle. Rest can be taken from the parent.
    this.manifest.entries.forEach(function filterDistinctAssets(entry) {
        var urlPath = url.parse(entry.urlPath).pathname;

        if (parentAssetBundle === undefined
            || parentAssetBundle.cachedAssetForUrlPath(urlPath, entry.hash) === null) {
            self._addAsset(new Asset(
                entry.filePath,
                urlPath,
                entry.fileType,
                entry.cacheable,
                entry.hash,
                entry.sourceMapUrlPath,
                entry.size,
                self
            ));
        }

        if (entry.sourceMapFilePath !== null && entry.sourceMapUrlPath !== null) {
            if (parentAssetBundle === undefined
                || parentAssetBundle.cachedAssetForUrlPath(entry.sourceMapUrlPath, null) === null) {
                self._addAsset(new Asset(
                    entry.sourceMapFilePath,
                    entry.sourceMapUrlPath,
                    'json',
                    true,
                    null,
                    null,
                    entry.size,
                    self
                ));
            }
        }
    });

    indexFile = new Asset('index.html', '/', 'html', false, null, null, null, this);
    this._addAsset(indexFile);
    this._indexFile = indexFile;
}

/**
 * Directory uri getter.
 * @returns {string}
 */
AssetBundle.prototype.getDirectoryUri = function getDirectoryUri() {
    return this.directoryUri;
};

/**
 * Parent asset bundle getter.
 * @returns {null|AssetBundle}
 */
AssetBundle.prototype.getParentAssetBundle = function getParentAssetBundle() {
    return this._parentAssetBundle;
};


/**
 * Returns an cacheable or hash equal asset.
 *
 * @param {string} urlPath - The url path of the asset.
 * @param {string|null} hash    - Hash of the asset.
 * @returns {null|Asset}
 */
AssetBundle.prototype.cachedAssetForUrlPath = function cachedAssetForUrlPath(urlPath, hash) {
    var asset;

    if (!(urlPath in this._ownAssetsByURLPath)) return null;
    asset = this._ownAssetsByURLPath[urlPath];

    // If the asset is not cacheable, we require a matching hash.
    if ((asset.cacheable && hash === null) || (asset.hash !== null && asset.hash === hash)) {
        return asset;
    }

    return null;
};

/**
 * Returns an array of own assets.
 *
 * @returns {Array}
 */
AssetBundle.prototype.getOwnAssets = function getOwnAssets() {
    var self = this;
    return Object.keys(this._ownAssetsByURLPath)
        .reduce(function reduceKeys(arr, key) {
            arr.push(self._ownAssetsByURLPath[key]);
            return arr;
        }, []);
};
/**
 * Version getter.
 * @returns {string}
 */
AssetBundle.prototype.getVersion = function getVersion() {
    return this._version;
};

/**
 * Loads runtime config.
 *
 * @returns {Object}
 */
AssetBundle.prototype.getRuntimeConfig = function getRuntimeConfig() {
    if (this._runtimeConfig === null) {
        this._runtimeConfig = this._loadRuntimeConfig(
            path.join(this.directoryUri, this._indexFile.filePath)
        );
    }
    return this._runtimeConfig;
};

/**
 * App id getter.
 *
 * @returns {String}
 */
AssetBundle.prototype.getAppId = function getAppId() {
    var runtimeConfig;
    if (this._appId === null) {
        runtimeConfig = this.getRuntimeConfig();
        if (runtimeConfig !== null) {
            if (!('appId' in runtimeConfig)) {
                this._l.log('error', 'Error reading APP_ID from runtime config');
            } else {
                this._appId = runtimeConfig.appId;
            }
        }
    }
    return this._appId;
};

/**
 * Return ROOT_URL from runtime config.
 *
 * @returns {string}
 */
AssetBundle.prototype.getRootUrlString = function getRootUrlString() {
    var runtimeConfig;
    if (this._rootUrlString === null) {
        runtimeConfig = this.getRuntimeConfig();
        if (runtimeConfig !== null) {
            if (!('ROOT_URL' in runtimeConfig)) {
                this._l.log('error', 'Error reading ROOT_URL from runtime config');
            } else {
                this._rootUrlString = runtimeConfig.ROOT_URL;
            }
        }
    }
    return this._rootUrlString;
};

/**
 * Changes bundles directory uri.
 *
 * @param {string} directoryUri - New directory path.
 */
AssetBundle.prototype.didMoveToDirectoryAtUri = function didMoveToDirectoryAtUri(directoryUri) {
    this.directoryUri = directoryUri;
};

/**
 * Returns asset queried by url path.
 * !UNUSED! Left in case of implementation change.
 *
 * @param {string} urlPath - Url path of the asset.
 *
 * @returns {Asset}
 */
AssetBundle.prototype._assetForUrlPath = function _assetForUrlPath(urlPath) {
    var asset;

    if (urlPath in this._ownAssetsByURLPath) {
        asset = this._ownAssetsByURLPath[urlPath];
    } else {
        if (this._parentAssetBundle !== null) {
            asset = this._parentAssetBundle._assetForUrlPath(urlPath);
        }
    }
    return asset;
};

/**
 * Load this bundle's asset manifest.
 *
 * @private
 * @returns {AssetManifest}
 */
AssetBundle.prototype._loadAssetManifest = function _loadAssetManifest() {
    var msg;
    var manifestPath = path.join(this.directoryUri, 'program.json');
    try {
        return new AssetManifest(
            this._l.getUnwrappedLogger(),
            fs.readFileSync(manifestPath, 'UTF-8')
        );
    } catch (e) {
        msg = 'Error loading asset manifest: ' + e.message;
        this._l.log('error', msg);
        this._l.log('debug', e);
        throw new Error(msg);
    }
};

/**
 * Extracts and parses runtime config.
 * TODO: no negative path errors in case loadRuntimeConfig fails?
 *
 * @param {string} index - Path for index.html.
 * @private
 * @returns {null}
 */
AssetBundle.prototype._loadRuntimeConfig = function _loadRuntimeConfig(index) {
    var content;
    var matches;

    try {
        content = fs.readFileSync(index, 'UTF-8');
    } catch (e) {
        this._l.log('error', 'Error loading index file: ' + e.message);
        return null;
    }

    if (!this._matcher.test(content)) {
        this._l.log('error', 'Could not find runtime config in index file');
        return null;
    }

    try {
        matches = content.match(this._matcher);
        return JSON.parse(decodeURIComponent(matches[1]));
    } catch (e) {
        this._l.log('error', 'Could not find runtime config in index file');
        return null;
    }
};

/**
 * Adds an asset to own assets collection.
 *
 * @param {Asset} asset - Asset to add.
 * @private
 */
AssetBundle.prototype._addAsset = function _addAsset(asset) {
    this._ownAssetsByURLPath[asset.urlPath] = asset;
};

module.exports = AssetBundle;
