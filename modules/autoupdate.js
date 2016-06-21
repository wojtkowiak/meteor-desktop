/**
 This is a modified JS port of hot code push android client from here:
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
 /cordova-plugin-meteor-webapp/blob/master/src/android/WebAppLocalServer.java

 */

import path from 'path';
import shell from 'shelljs';
import fs from 'fs';
import url from 'url';

const { join } = path;

import AssetBundle from './autoupdate/assetBundle';
import AssetBundleManager from './autoupdate/assetBundleManager';

function exists(checkPath) {
    try {
        fs.accessSync(checkPath);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Represents the hot code push client.
 * Unlike the Cordova implementation this does not have a builtin HTTP server.
 *
 * @constructor
 */
class HCPClient {

    constructor(log, app, appSettings, systemEvents, modules, settings, Module) {
        // Get the automtically predefined logger instance.
        this.log = log.loggers.get('autoupdate');

        // Register this as a Meteor Desktop module.
        this.module = new Module('autoupdate');

        this.settings = settings;

        this.startupTimer = null;
        this.window = null;

        this.systemEvents = systemEvents;

        // We want this to be initialized before loading the desktop part.
        this.systemEvents.on('beforeDesktopLoaded', this.init.bind(this));

        // We will need a reference to the BrowserWindow object once it will be available.
        this.systemEvents.on('windowOpened', window => (this.window = window));

        // Lets register for some ICP events. You can treat this as public API.
        this.module.on('checkForUpdates', this.checkForUpdates.bind(this));
        this.module.on('startupDidComplete', this.startupDidComplete.bind(this));

        this.resetConfig();

        this.configFile = join(this.settings.dataPath, 'autoupdate.json');
        this.versionsDir = join(this.settings.bundleStorePath, 'versions');
    }

    /**
     * Resets or sets and empty config object.
     *
     * @private
     */
    resetConfig() {
        this.config = {
            appId: null,
            rootUrlString: null,
            cordovaCompatibilityVersion: null,
            blacklistedVersions: [],
            lastDownloadedVersion: null
        };
    }

    /**
     * Performs autoupdate initialization.
     *
     * @private
     */
    init() {
        this.log.verbose('initializing autoupdate module');
        try {
            fs.accessSync(this.configFile, fs.F_OK);
        } catch (e) {
            this.saveConfig();
            this.log.info('created empty autoupdate.json');
        }

        this.readConfig();
        this.initializeAssetBundles();

        this.config.appId = this.currentAssetBundle.getAppId();
        this.config.rootUrlString = this.currentAssetBundle.getRootUrlString();
        this.config.cordovaCompatibilityVersion =
            this.currentAssetBundle.cordovaCompatibilityVersion;

        this.saveConfig();
    }

    /**
     * Looks for available assets bundles. Chooses which version to use.
     *
     * @private
     */
    initializeAssetBundles() {
        this.log.verbose('trying to read initial bundle version');
        const initialAssetBundle = new AssetBundle(
            this.log,
            this.settings.initialBundlePath
        );

        // If the last seen initial version is different from the currently bundled
        // version, we delete the versions directory and unset lastDownloadedVersion
        // and blacklistedVersions.
        if (initialAssetBundle.getVersion() !== this.config.lastSeenInitialVersion) {
            this.log.info(
                'detected new bundled version, removing versions directory if it exists');
            if (exists(this.versionsDir)) {
                shell.rm('-rf', this.versionsDir);
                if (exists(this.versionsDir)) {
                    this.log.warn('could not remove versions directory');
                }
            }
            this.resetConfig();
        }

        // We keep track of the last seen initial version (see above).
        this.config.lastSeenInitialVersion = initialAssetBundle.getVersion();

        // If the versions directory does not exist, we create it.
        if (!exists(this.versionsDir)) {
            this.log.info('created versions dir');
            // TODO: what if this fails? We need to report this to the main app.
            shell.mkdir(this.versionsDir);
        }

        this.assetBundleManager = new AssetBundleManager(
            this.log,
            this.config,
            initialAssetBundle,
            this.versionsDir
        );

        this.assetBundleManager.setCallback(this);

        this.currentAssetBundle = null;

        const lastDownloadedVersion = this.config.lastDownloadedVersion;
        if (lastDownloadedVersion) {
            this.currentAssetBundle = this.assetBundleManager
                .downloadedAssetBundleWithVersion(lastDownloadedVersion);
            this.log.verbose(
                `using last downloaded version (${lastDownloadedVersion})`);

            if (!this.currentAssetBundle) {
                this.log.warn('seems that last downloaded version does not exists... ' +
                    'using initial asset bundle');
                this.currentAssetBundle = initialAssetBundle;
            }
        } else {
            this.log.verbose('using initial asset bundle');
            this.currentAssetBundle = initialAssetBundle;
        }

        this.pendingAssetBundle = null;
    }

    /**
     * Start the checking for update procedure.
     * @private
     */
    checkForUpdates() {
        const rootUrl = this.currentAssetBundle.getRootUrlString();
        if (!rootUrl) {
            this.log.error('no rootUrl found in the current asset bundle');
            this.module.send(
                'error',
                'checkForUpdates requires a rootURL to be configured'
            );
            return;
        }

        this.assetBundleManager.checkForUpdates(url.resolve(rootUrl, '__cordova/'));
    }

    /**
     * Returns version of the currently pending asset bundle.
     * @returns {null|string}
     */
    getPendingVersion() {
        if (this.pendingAssetBundle !== null) {
            return this.pendingAssetBundle.getVersion();
        }
        return null;
    }

    /**
     * Returns the current assets bundle's directory.
     * @returns {string}
     */
    getDirectory() {
        return this.currentAssetBundle.getDirectoryUri();
    }

    /**
     * Returns the parent asset bundle's directory.
     * @returns {string|null}
     */
    getParentDirectory() {
        return this.currentAssetBundle.getParentAssetBundle() ?
            this.currentAssetBundle.getParentAssetBundle().getDirectoryUri() : null;
    }

    /**
     * Starts the startup timer which is a fallback mechanism in case we received a faulty version.
     * @private
     */
    startStartupTimer() {
        this.removeStartupTimer();

        this.startupTimerStartTimestamp = Date.now();
        this.startupTimer = setTimeout(() => {
            this.revertToLastKnownGoodVersion();
        }, this.settings.webAppStartupTimeout);

        this.log.verbose('started startup timer');
        this.log.debug(`timer set to ${this.settings.webAppStartupTimeout}`);
    }

    /**
     * Reverts to last know good version in case we did not receive an event saying that the app
     * has started successfully.
     * @private
     */
    revertToLastKnownGoodVersion() {
        // Blacklist the current version, so we don't update to it again right away.
        this.log.warn('startup timer expired, reverting to another version');

        if (!~this.config.blacklistedVersions.indexOf(this.currentAssetBundle.getVersion())) {
            this.log.debug(`blacklisted version ${this.currentAssetBundle.getVersion()}`);
            this.config.blacklistedVersions.push(this.currentAssetBundle.getVersion());
            this.saveConfig();
        }

        // If there is a last known good version and we can load the bundle, revert to it.
        const lastKnownGoodVersion = this.config.lastKnownGoodVersion;
        if (lastKnownGoodVersion) {
            const assetBundle = this.assetBundleManager
                .downloadedAssetBundleWithVersion(lastKnownGoodVersion);
            if (assetBundle) {
                this.log.info(`reverting to last known good version: ${assetBundle.getVersion()}`);
                this.pendingAssetBundle = assetBundle;
            }
        } else if (this.currentAssetBundle !== this.assetBundleManager._initialAssetBundle) {
            // Else, revert to the initial asset bundle, unless that is what we are currently
            // serving.
            this.log.info('reverting to initial bundle');
            this.pendingAssetBundle = this.assetBundleManager._initialAssetBundle;
        }

        // Only reload if we have a pending asset bundle to reload.
        if (this.pendingAssetBundle) {
            this.log.warn(`will try to revert to ${this.pendingAssetBundle.getVersion()}`);
            this.window.reload();
        }
    }

    /**
     * Stops the startup timer.
     * @private
     */
    removeStartupTimer() {
        if (this.startupTimer) {
            clearTimeout(this.startupTimer);
            this.startupTimer = null;
        }
    }

    /**
     * Fired from the Meteor app. Tells us that this version seems to be fine.
     *
     * @param {function} onVersionsCleanedUp - Callback to be called after versions dir cleanup.
     *
     * @private
     */
    startupDidComplete(onVersionsCleanedUp = Function.prototype) {
        this.log.verbose('startup did complete, stopping startup timer (startup took ' +
            `${Date.now() - this.startupTimerStartTimestamp}ms)`);
        this.removeStartupTimer();

        // If startup completed successfully, we consider a version good.
        this.config.lastKnownGoodVersion = this.currentAssetBundle.getVersion();
        this.saveConfig();

        setImmediate(() => {
            this.assetBundleManager
                .removeAllDownloadedAssetBundlesExceptForVersion(
                    this.currentAssetBundle.getVersion()
                );

            if (typeof onVersionsCleanedUp === 'function') {
                onVersionsCleanedUp();
            }
            this.module.send('onVersionsCleanedUp');
        });
    }

    /**
     * This is fired when a new version is ready and we need to reset (reload) the BrowserWindow.
     */
    onReset() {
        // If there is a pending asset bundle, we make it the current
        if (this.pendingAssetBundle !== null) {
            this.currentAssetBundle = this.pendingAssetBundle;
            this.pendingAssetBundle = null;
        }

        this.log.info(`serving asset bundle with version: ${this.currentAssetBundle.getVersion()}`);

        this.config.appId = this.currentAssetBundle.getAppId();
        this.config.rootUrlString = this.currentAssetBundle.getRootUrlString();
        this.config.cordovaCompatibilityVersion =
            this.currentAssetBundle.cordovaCompatibilityVersion;

        this.saveConfig();

        // Don't start startup timer when running a test.
        if (!this.settings.test) {
            this.startStartupTimer();
        }
    }

    /**
     * Save the current config.
     * @private
     */
    saveConfig() {
        fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, '\t'));
    }

    /**
     * Reads config json file.
     * @private
     */
    readConfig() {
        try {
            this.config = JSON.parse(fs.readFileSync(this.configFile, 'UTF-8'));
        } catch (e) {
            this.log.error('could not read the config.json');
            this.resetConfig();
            this.saveConfig();
        }
    }

    /**
     * Error callback fired by assetBundleManager.
     * @param cause
     */
    onError(cause) {
        this.notifyError(cause);
    }

    /**
     * Fires error callback from the Meteor app side.
     *
     * @param {string} cause - Error message.
     * @private
     */
    notifyError(cause) {
        this.log.error(`download failure: ${cause}`);
        this.module.send(
            'error',
            `[autoupdate] Download failure: ${cause}`
        );
    }

    /**
     * Makes downloaded asset pending. Fired by assetBundleManager.
     * @param assetBundle
     */
    onFinishedDownloadingAssetBundle(assetBundle) {
        this.log.verbose(
            `setting last downloaded and pending version as ${assetBundle.getVersion()}`);
        this.config.lastDownloadedVersion = assetBundle.getVersion();
        this.saveConfig();
        this.pendingAssetBundle = assetBundle;
        this.notifyNewVersionReady(assetBundle.getVersion());
    }

    /**
     * Notify meteor that a new version is ready.
     * @param {string} version - Version string.
     * @private
     */
    notifyNewVersionReady(version) {
        this.systemEvents.emit('newVersionReady');
        this.module.send(
            'onNewVersionReady',
            version
        );
    }

    /**
     * Method that decides whether we are interested in the new bundle that we were notified about.
     * Called by assetBundleManager.
     * @param {AssetManifest} manifest - Manifest of the new bundle.
     * @returns {boolean}
     */
    shouldDownloadBundleForManifest(manifest) {
        const version = manifest.version;

        // No need to redownload the current version.
        if (this.currentAssetBundle.getVersion() === version) {
            this.log.info(`skipping downloading current version: ${version}`);
            return false;
        }

        // No need to redownload the pending version.
        if (this.pendingAssetBundle &&
            this.pendingAssetBundle.getVersion() === version) {
            this.log.info(`skipping downloading pending version: ${version}`);
            return false;
        }

        // Don't download blacklisted versions.
        if (~this.config.blacklistedVersions.indexOf(version)) {
            this.log.warn(`skipping downloading blacklisted version: ${version}`);
            this.notifyError(`skipping downloading blacklisted version: ${version}`);
            return false;
        }

        // Don't download versions potentially incompatible with the bundled native code
        // This is commented out intentionally as we do not care about cordova compatibility version
        // this should not affect us.
        /*
        if (this.config.cordovaCompatibilityVersion !== manifest.cordovaCompatibilityVersion) {
            this.notifyError("Skipping downloading new version because the Cordova platform version
             or plugin versions have changed and are potentially incompatible");
            return false;
        }
        */
        // TODO: place for checking electron compatibility version

        return true;
    }
}

module.exports = HCPClient;
