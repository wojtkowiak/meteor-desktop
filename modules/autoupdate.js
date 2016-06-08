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
 /cordova-plugin-meteor-webapp/blob/master/src/android/WebAppLocalServer.java

 */

var Module = require('./module.js');
var path = require('path');
var join = path.join;
var shell = require('shelljs');
var fs = require('fs');
var url = require('url');
var Log = require('./autoupdate/logger');

var AssetBundle = require('./autoupdate/assetBundle');
var AssetBundleManager = require('./autoupdate/assetBundleManager');

var winston = require('winston');
var log = new winston.Logger({
    level: 'debug',
    transports: [
        new (winston.transports.Console)(),
        new (winston.transports.File)({ filename: join(__dirname, '..', 'autoupdateModule.log') })
    ]
});

/**
 * Represents the hot code push client.
 * Unlike the cordova implementation this does not have a builtin HTTP server.
 *
 * @constructor
 */
function HCPClient(l, app, settings, systemEvents) {
    var self = this;
    var autoupdateModule = new Module('autoupdateModule');

    this._l = new Log('HCPClient', log);

    systemEvents.on('beforeDesktopLoaded', this._init.bind(this));

    this._config = {
        appId: null,
        rootUrlString: null,
        cordovaCompatibilityVersion: null,
        blacklistedVersions: [],
        lastDownloadedVersion: null
    };

    this._configFile = join(__dirname, '..', 'autoupdateModule.json');
    this._versionsDir = join(__dirname, '..', 'versions');

    this._module = autoupdateModule;

    this._module.on('checkForUpdates', function checkForUpdates() {
        var rootUrl = self._currentAssetBundle.getRootUrlString();
        if (rootUrl === null) {
            module.send(
                'error',
                'checkForUpdates requires a rootURL to be configured'
            );
            return;
        }

        self._assetBundleManager.checkForUpdates(url.resolve(rootUrl, '__cordova/'));
        self._event = null;
    });
}

/**
 * Performs initialization.
 *
 * @private
 */
HCPClient.prototype._init = function _init() {
    var initialAssetBundle;
    var lastDownloadedVersion;

    if (!fs.existsSync(this._configFile)) {
        this._saveConfig();
        this._l.log('info', 'Created empty autoupdateModule.json');
    }

    this._readConfig();

    this._l.log('debug', 'Reading initial version');
    initialAssetBundle = new AssetBundle(
        this._l.getUnwrappedLogger(),
        join(__dirname, '..', 'meteor')
    );

    // If the last seen initial version is different from the currently bundled
    // version, we delete the versions directory and unset lastDownloadedVersion
    // and blacklistedVersions
    /*
     if (!initialAssetBundle.getVersion().equals(configuration.getLastSeenInitialVersion()))  {
     Log.d(LOG_TAG, "Detected new bundled version, removing versions directory if it exists");
     if (versionsDirectory.exists()) {
     if (!IOUtils.deleteRecursively(versionsDirectory)) {
     Log.w(LOG_TAG, "Could not remove versions directory");
     }
     }
     configuration.reset();
     }*/

    // We keep track of the last seen initial version (see above)
    this._config.lastSeenInitialVersion = initialAssetBundle.getVersion();

    // If the versions directory does not exist, we create it
    if (!fs.existsSync(this._versionsDir)) {
        this._l.log('info', 'Created versions dir.');
        // TODO: try/catch
        shell.mkdir(this._versionsDir);
    }

    this._assetBundleManager = new AssetBundleManager(
        this._l.getUnwrappedLogger(),
        this._config,
        initialAssetBundle,
        this._versionsDir
    );

    this._assetBundleManager.setCallback(this);

    lastDownloadedVersion = this._config.lastDownloadedVersion;
    if (lastDownloadedVersion) {
        this._currentAssetBundle = this._assetBundleManager
            ._downloadedAssetBundlesByVersion[lastDownloadedVersion];

        if (this._currentAssetBundle === null) {
            this._currentAssetBundle = initialAssetBundle;
        }
    } else {
        this._currentAssetBundle = initialAssetBundle;
    }

    this._config.appId = this._currentAssetBundle.getAppId();
    this._config.rootUrlString = this._currentAssetBundle.getRootUrlString();
    this._config.cordovaCompatibilityVersion = this._currentAssetBundle.cordovaCompatibilityVersion;

    this._saveConfig();

    this._pendingAssetBundle = null;
};

HCPClient.prototype.getPendingVersion = function getPendingVersion() {
    if (this._pendingAssetBundle !== null) {
        return this._pendingAssetBundle.getVersion();
    }
    return null;
}

/**
 * Returns the current assets bundle's directory.
 * @returns {string}
 */
HCPClient.prototype.getDirectory = function getDirectory() {
    return this._currentAssetBundle.getDirectoryUri();
};

/**
 * Returns the parent asset bundle's directory.
 * @returns {string|null}
 */
HCPClient.prototype.getParentDirectory = function getParentDirectory() {
    return this._currentAssetBundle.getParentAssetBundle() ?
        this._currentAssetBundle.getParentAssetBundle().getDirectoryUri() : null;
};


/**
 * This is fired when a new version is ready and we need to reset (reload) the Browser.
 */
HCPClient.prototype.onReset = function onReset() {
    // If there is a pending asset bundle, we make it the current
    if (this._pendingAssetBundle !== null) {
        this._currentAssetBundle = this._pendingAssetBundle;
        this._pendingAssetBundle = null;
    }

    this._l.log('info', 'Serving asset bundle with version: '
        + this._currentAssetBundle.getVersion());

    this._config.appId = this._currentAssetBundle.getAppId();
    this._config.rootUrlString = this._currentAssetBundle.getRootUrlString();
    this._config.cordovaCompatibilityVersion = this._currentAssetBundle.cordovaCompatibilityVersion;

    this._saveConfig();

    // Don't start startup timer when running a test
    // if (testingDelegate == null) {
    //  startStartupTimer();
    // }
};

/**
 * Save the current config.
 * @private
 */
HCPClient.prototype._saveConfig = function _saveConfig() {
    fs.writeFileSync(this._configFile, JSON.stringify(this._config, null, '\t'));
};

/**
 * Reads config json file.
 * @private
 */
HCPClient.prototype._readConfig = function _readConfig() {
    // TODO: try/catch
    this._config = JSON.parse(fs.readFileSync(this._configFile, 'UTF-8'));
};

/**
 * Error callback fired by assetBundleManager.
 * @param cause
 */
HCPClient.prototype.onError = function onError(cause) {
    this._l.log('error', 'Download failure: ' + cause);
    this._notifyError(cause);
};

/**
 * Fires error callback from the meteor's side.
 *
 * @param {string} cause - Error message.
 * @private
 */
HCPClient.prototype._notifyError = function _notifyError(cause) {
    this._l.log('error', 'Download failure: ' + cause);
    this._module.send(
        'error',
        '[autoupdate] Download failure: ' + cause
    );
};

/**
 * Makes downloaded asset pending. Fired by assetBundleManager.
 * @param assetBundle
 */
HCPClient.prototype.onFinishedDownloadingAssetBundle =
    function onFinishedDownloadingAssetBundle(assetBundle) {
        this._config.lastDownloadedVersion = assetBundle.getVersion();
        this._saveConfig();
        this._pendingAssetBundle = assetBundle;
        this._notifyNewVersionReady(assetBundle.getVersion());
    };

/**
 * Notify meteor that a new version is ready.
 * @param {string} version - Version string.
 * @private
 */
HCPClient.prototype._notifyNewVersionReady = function _notifyNewVersionReady(version) {
    this._module.send(
        'onNewVersionReady',
        version
    );
};

/**
 * Method that decides whether we are interested in the new bundle that we were notified about.
 *
 * @param {AssetManifest} manifest - Manifest of the new bundle.
 * @returns {boolean}
 */
HCPClient.prototype.shouldDownloadBundleForManifest =
    function shouldDownloadBundleForManifest(manifest) {
        var version = manifest.version;

        // No need to redownload the current version
        if (this._currentAssetBundle.getVersion() === version) {
            this._l.log('info', 'Skipping downloading current version: ' + version);
            return false;
        }

        // No need to redownload the pending version
        if (this._pendingAssetBundle !== null &&
            this._pendingAssetBundle.getVersion() === version) {
            this._l.log('info', 'Skipping downloading pending version: ' + version);
            return false;
        }

        // Don't download blacklisted versions
        if (~this._config.blacklistedVersions.indexOf(version)) {
            this._notifyError('Skipping downloading blacklisted version: ' + version);
            return false;
        }

        // TODO: place for checking electron compatibility version

        return true;
    };

module.exports = HCPClient;
