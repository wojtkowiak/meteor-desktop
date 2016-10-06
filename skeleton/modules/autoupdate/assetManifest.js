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
 /cordova-plugin-meteor-webapp/blob/master/src/android/AssetManifest.java

 */

import assignIn from 'lodash/assignIn';

/**
 * Represents single file in the manifest.
 *
 * @param {object} manifestEntry
 * @param {string} manifestEntry.path
 * @param {string} manifestEntry.url
 * @param {string} manifestEntry.type
 * @param {number} manifestEntry.size
 * @param {bool}   manifestEntry.cacheable
 * @param {string} manifestEntry.hash
 * @param {string} manifestEntry.sourceMap
 * @param {string} manifestEntry.sourceMapUrl
 *
 * @property {string} filePath
 * @property {string} urlPath
 * @property {string} fileType
 * @property {number} size
 * @property {bool}   cacheable
 * @property {string} hash
 * @property {string} sourceMapFilePath
 * @property {string} sourceMapUrlPath
 * @constructor
 */
function ManifestEntry(manifestEntry) {
    assignIn(this, {
        filePath: manifestEntry.path,
        urlPath: manifestEntry.url,
        fileType: manifestEntry.type,
        size: manifestEntry.size,
        cacheable: manifestEntry.cacheable,
        hash: manifestEntry.hash || null,
        sourceMapFilePath: manifestEntry.sourceMap || null,
        sourceMapUrlPath: manifestEntry.sourceMapUrl || null
    });
}

/**
 * Represents a program.json app manifest.
 *
 * @param {Object} logger         - Logger instance.
 * @param {string} manifestSource - Manifest source.
 *
 * @property {string} version
 * @property {string} cordovaCompatibilityVersion
 *
 * @constructor
 */
export default function AssetManifest(logger, manifestSource) {
    const log = logger.getLoggerFor('AssetManifest');
    let json;
    let format;

    function error(msg) {
        log.error(msg);
        throw new Error(msg);
    }

    try {
        /**
         * @type object
         * @property {string} format
         * @property {string|null} version
         * @property {object} cordovaCompatibilityVersions
         * @property {string} cordovaCompatibilityVersions.android
         * @property {string} cordovaCompatibilityVersions.ios
         * @property {Array} manifest
         */
        json = JSON.parse(manifestSource);
        format = json.format || null;

        if (format !== null && format !== 'web-program-pre1') {
            error(`The asset manifest format is incompatible: ${format}`);
        }
        if (!('version' in json) || json.version === null) {
            error('Asset manifest does not have a version.');
        }

        this.version = json.version;

        // We are not using compatibility versions, but for sanity check this is ok.
        if (!('cordovaCompatibilityVersions' in json) ||
            !('android' in json.cordovaCompatibilityVersions)) {
            error('Asset manifest does not have a cordovaCompatibilityVersion.');
        }

        this.cordovaCompatibilityVersion = json.cordovaCompatibilityVersions.android;

        this.entries = json.manifest
            .filter(manifestEntry => manifestEntry.where === 'client')
            .map(manifestEntry => new ManifestEntry(manifestEntry));

        log.debug(`${this.entries.length} entries. (Version: ${this.version})`);
    } catch (e) {
        error(`error parsing asset manifest: ${e.message}`);
    }
}

module.exports = AssetManifest;

/**
 * @typedef {Object} AssetManifest
 * @property {string} version
 * @property {string} cordovaCompatibilityVersion
 */
