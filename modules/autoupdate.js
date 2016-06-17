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

var path = require('path');
var join = path.join;
var shell = require('shelljs');
var fs = require('fs');
var url = require('url');

var AssetBundle = require('./autoupdate/assetBundle');
var AssetBundleManager = require('./autoupdate/assetBundleManager');

/**
 * Represents the hot code push client.
 * Unlike the cordova implementation this does not have a builtin HTTP server.
 *
 * @constructor
 */
function HCPClient(log, app, appSettings, systemEvents, modules, settings, Module) {
    this.settings = settings;
    var self = this;
    var autoupdateModule = new Module('autoupdate');

    this._l = log.loggers.get('autoupdate');
    this._startupTimer = null;

    this._window = null;

    systemEvents.on('beforeDesktopLoaded', this._init.bind(this));
    systemEvents.on('windowOpened', (window) => this._window = window);

    this._config = {
        appId: null,
        rootUrlString: null,
        cordovaCompatibilityVersion: null,
        blacklistedVersions: [],
        lastDownloadedVersion: null
    };

    this._configFile = join(this.settings.dataPath, 'autoupdate.json');
    this._versionsDir = join(this.settings.bundleStorePath, 'versions');

    this._module = autoupdateModule;

    this._module.on('checkForUpdates', this.checkForUpdates.bind(this));
    this._module.on('startupDidComplete', this.startupDidComplete.bind(this));

    this.systemEvents = systemEvents;
}


HCPClient.prototype.checkForUpdates = function checkForUpdates() {
    var rootUrl = this._currentAssetBundle.getRootUrlString();
    if (rootUrl === null) {
        this._module.send(
            'error',
            'checkForUpdates requires a rootURL to be configured'
        );
        return;
    }

    this._assetBundleManager.checkForUpdates(url.resolve(rootUrl, '__cordova/'));
    this._event = null;
};

/**
 * Performs initialization.
 *
 * @private
 */
HCPClient.prototype._init = function _init() {


    if (!fs.existsSync(this._configFile)) {
        this._saveConfig();
        this._l.info('Created empty autoupdate.json');
    }

    this._readConfig();

    this.initializeAssetBundles();

    this._config.appId = this._currentAssetBundle.getAppId();
    this._config.rootUrlString = this._currentAssetBundle.getRootUrlString();
    this._config.cordovaCompatibilityVersion = this._currentAssetBundle.cordovaCompatibilityVersion;

    this._saveConfig();
};

HCPClient.prototype.initializeAssetBundles = function initializeAssetBundles() {
    var initialAssetBundle;
    var lastDownloadedVersion;

    this._l.debug('Reading initial version');
    initialAssetBundle = new AssetBundle(
        this._l,
        this.settings.initialBundlePath
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
        this._l.info('Created versions dir.');
        // TODO: try/catch
        shell.mkdir(this._versionsDir);
    }

    this._assetBundleManager = new AssetBundleManager(
        this._l,
        this._config,
        initialAssetBundle,
        this._versionsDir
    );

    this._assetBundleManager.setCallback(this);

    lastDownloadedVersion = this._config.lastDownloadedVersion;
    if (lastDownloadedVersion) {
        this._currentAssetBundle = this._assetBundleManager
            ._downloadedAssetBundlesByVersion[lastDownloadedVersion];

        if (!this._currentAssetBundle) {
            this._currentAssetBundle = initialAssetBundle;
        }
    } else {
        this._currentAssetBundle = initialAssetBundle;
    }

    this._pendingAssetBundle = null;
}

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


HCPClient.prototype.startStartupTimer = function startStartupTimer() {
    this.removeStartupTimer();

    // TODO: make startup time configurable
    this._startupTimer = setTimeout(() => {
        this.revertToLastKnownGoodVersion();
    }, 20000);

    this._l.debug('started startup timer');

};


HCPClient.prototype.revertToLastKnownGoodVersion = function revertToLastKnownGoodVersion() {
    // Blacklist the current version, so we don't update to it again right away
    this._l.warn('startup timer expired, reverting to another version');

    if (!~this._config.blacklistedVersions.indexOf(this._currentAssetBundle.getVersion())) {
        this._config.blacklistedVersions.push(this._currentAssetBundle.getVersion());
        this._saveConfig();
    }

    // If there is a last known good version and we can load the bundle, revert to it
    const lastKnownGoodVersion = this._config.lastKnownGoodVersion;
    if (lastKnownGoodVersion) {
        const assetBundle = this._assetBundleManager.downloadedAssetBundleWithVersion(lastKnownGoodVersion);
        if (assetBundle) {
            this._l.debug('reverting to last known good version: ', assetBundle.getVersion());

            this._pendingAssetBundle = assetBundle;
        }
    } else if (this._currentAssetBundle !== this._assetBundleManager._initialAssetBundle) {
        // Else, revert to the initial asset bundle, unless that is what we are currently serving
        this._l.debug('reverting to initial bundle');
        this._pendingAssetBundle = this._assetBundleManager._initialAssetBundle;
    }

    // Only reload if we have a pending asset bundle to reload
    if (this._pendingAssetBundle) {
        this._l.warn('will try to revert to: ', this._pendingAssetBundle.getVersion());
        this._window.reload();
    }
}

HCPClient.prototype.removeStartupTimer = function removeStartupTimer() {
    if (this._startupTimer) {
        clearTimeout(this._startupTimer);
        this._startupTimer = null;
    }
};

HCPClient.prototype.startupDidComplete = function startupDidComplete(onVersionsCleanedUp = Function.prototype) {
    this.removeStartupTimer();

    // If startup completed successfully, we consider a version good
    this._config.lastKnownGoodVersion = this._currentAssetBundle.getVersion();
    this._saveConfig();

    setImmediate(() => {
        this._assetBundleManager.removeAllDownloadedAssetBundlesExceptForVersion(this._currentAssetBundle.getVersion());
        if (typeof onVersionsCleanedUp === 'function') {
            onVersionsCleanedUp();
        }
        this._module.send('onVersionsCleanedUp');
    });
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

    this._l.info('Serving asset bundle with version: '
        + this._currentAssetBundle.getVersion());

    this._config.appId = this._currentAssetBundle.getAppId();
    this._config.rootUrlString = this._currentAssetBundle.getRootUrlString();
    this._config.cordovaCompatibilityVersion = this._currentAssetBundle.cordovaCompatibilityVersion;

    this._saveConfig();

    // Don't start startup timer when running a test
    if (!this.settings.test) {
       this.startStartupTimer();
    }
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
    this._l.error('Download failure: ' + cause);
    this._notifyError(cause);
};

/**
 * Fires error callback from the meteor's side.
 *
 * @param {string} cause - Error message.
 * @private
 */
HCPClient.prototype._notifyError = function _notifyError(cause) {
    this._l.error('Download failure: ' + cause);
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
    this.systemEvents.emit('newVersionReady');
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
            this._l.info('Skipping downloading current version: ' + version);
            return false;
        }

        // No need to redownload the pending version
        if (this._pendingAssetBundle !== null &&
            this._pendingAssetBundle.getVersion() === version) {
            this._l.info('Skipping downloading pending version: ' + version);
            return false;
        }

        // Don't download blacklisted versions
        if (~this._config.blacklistedVersions.indexOf(version)) {
            this._notifyError('Skipping downloading blacklisted version: ' + version);
            return false;
        }

        // Don't download versions potentially incompatible with the bundled native code
        // This is commented out intentionally as we do not care about cordova compatibility version
        // this should not affect us.
        /*if (this._config.cordovaCompatibilityVersion !== manifest.cordovaCompatibilityVersion) {
            this._notifyError("Skipping downloading new version because the Cordova platform version or plugin versions have changed and are potentially incompatible");
            return false;
        }*/

        // TODO: place for checking electron compatibility version

        return true;
    };

module.exports = HCPClient;
