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
import fs from 'fs-plus';
import originalFs from 'original-fs';
import rimraf from 'rimraf';
import url from 'url';

import AssetBundle from './autoupdate/assetBundle';
import AssetBundleManager from './autoupdate/assetBundleManager';

const { join } = path;

/**
 * Represents the hot code push client.
 * Unlike the Cordova implementation this does not have a builtin HTTP server.
 *
 * @constructor
 */
export default class HCPClient {

    constructor({ log, appSettings, eventsBus, settings, Module }) {
        // Get the automatically predefined logger instance.
        this.log = log;

        // Register this as a Meteor Desktop module.
        this.module = new Module('autoupdate');

        this.settings = settings;
        this.appSettings = appSettings;

        this.startupTimer = null;
        this.window = null;

        this.eventsBus = eventsBus;

        // We want this to be initialized before loading the desktop part.
        this.eventsBus.on('beforeDesktopJsLoad', this.init.bind(this));

        // We will need a reference to the BrowserWindow object once it will be available.
        this.eventsBus.on('windowCreated', (window) => {
            this.window = window;
            // Start the startup timer.
            this.startStartupTimer();
        });

        // Lets register for some ICP events. You can treat this as public API.
        this.module.on('checkForUpdates', this.checkForUpdates.bind(this));
        this.module.on('startupDidComplete', this.startupDidComplete.bind(this));

        this.resetConfig();

        this.configFile = join(this.settings.dataPath, 'autoupdate.json');
        this.versionsDir = join(this.settings.bundleStorePath, 'versions');
        this.desktopBundlePath = this.settings.desktopBundlePath;
    }

    /**
     * Resets or sets an empty config object.
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
            if (fs.existsSync(this.versionsDir)) {
                // Using rimraf specifically instead of shelljs.rm because despite using
                // process.noAsar shelljs tried to remove files inside asar instead of just
                // deleting the archive. `del` also could not delete asar archive. Rimraf is ok
                // because it accepts custom fs object.
                rimraf.sync(this.versionsDir, originalFs);
                if (fs.existsSync(this.versionsDir)) {
                    this.log.warn('could not remove versions directory');
                }
            }
            this.resetConfig();
        }

        // We keep track of the last seen initial version (see above).
        this.config.lastSeenInitialVersion = initialAssetBundle.getVersion();

        // If the versions directory does not exist, we create it.
        if (!fs.existsSync(this.versionsDir)) {
            this.log.info('created versions dir');
            // TODO: what if this fails? We need to report this to the main app.
            shell.mkdir(this.versionsDir);
        }

        this.assetBundleManager = new AssetBundleManager(
            this.log,
            this.config,
            initialAssetBundle,
            this.versionsDir,
            this.desktopBundlePath,
            this.appSettings
        );

        this.assetBundleManager.setCallback(this);

        this.currentAssetBundle = null;

        const lastDownloadedVersion = this.config.lastDownloadedVersion;
        if (lastDownloadedVersion) {
            if (~this.config.blacklistedVersions.indexOf(lastDownloadedVersion)) {
                this.useLastKnownGoodVersion();
            } else if (lastDownloadedVersion !== initialAssetBundle.getVersion()) {
                this.currentAssetBundle = this.assetBundleManager
                    .downloadedAssetBundleWithVersion(lastDownloadedVersion);
                this.log.verbose(
                    `will use last downloaded version (${lastDownloadedVersion})`);

                if (!this.currentAssetBundle) {
                    this.log.warn('seems that last downloaded version does not exists... ');
                    this.useLastKnownGoodVersion();
                } else if (lastDownloadedVersion !== this.config.lastKnownGoodVersion) {
                    this.startStartupTimer();
                }
            } else {
                this.currentAssetBundle = initialAssetBundle;
                this.log.verbose(
                    `will use last downloaded version which is apparently also the initial asset bundle (${lastDownloadedVersion})`);
            }
        } else {
            this.log.verbose('using initial asset bundle');
            this.currentAssetBundle = initialAssetBundle;
        }

        this.pendingAssetBundle = null;
    }

    /**
     * Reverts to either last known good version or the initial version if there is none available.
     * @private
     */
    useLastKnownGoodVersion() {
        const lastKnownGoodVersion = this.config.lastKnownGoodVersion;
        this.log.debug(`last known good version is ${this.config.lastKnownGoodVersion}`);
        if (lastKnownGoodVersion
            && lastKnownGoodVersion !== this.assetBundleManager.initialAssetBundle.getVersion()) {
            const assetBundle = this.assetBundleManager
                .downloadedAssetBundleWithVersion(lastKnownGoodVersion);
            this.log.info(`will use last known good version: ${assetBundle.getVersion()}`);
            this.currentAssetBundle = assetBundle;
        } else {
            this.log.verbose('using initial asset bundle because last know good version' +
                'does not exist');
            this.currentAssetBundle = this.assetBundleManager.initialAssetBundle;
        }
    }

    /**
     * Start the checking for update procedure.
     * @private
     */
    checkForUpdates() {
        const rootUrl = this.settings.customHCPUrl ?
            this.settings.customHCPUrl : this.currentAssetBundle.getRootUrlString();

        this.log.verbose(`checking for updates on ${rootUrl}`);
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
     * Returns the currently used asset bundle.
     *
     * @returns {null|AssetBundle}
     */
    getCurrentAssetBundle() {
        return this.currentAssetBundle;
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
            this.removeStartupTimer();
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

        // If this is the initial version, we will not get anything from blacklisting it.
        if (this.currentAssetBundle.getVersion() !==
            this.assetBundleManager.initialAssetBundle.getVersion() &&
            !~this.config.blacklistedVersions.indexOf(this.currentAssetBundle.getVersion())
        ) {
            this.log.debug(`blacklisted version ${this.currentAssetBundle.getVersion()}`);
            this.config.blacklistedVersions.push(this.currentAssetBundle.getVersion());
            this.saveConfig();
        }

        // If there is a last known good version and we can load the bundle, revert to it.
        const lastKnownGoodVersion = this.config.lastKnownGoodVersion;
        this.log.debug(`last known good version is ${this.config.lastKnownGoodVersion}`);
        if (lastKnownGoodVersion
            && lastKnownGoodVersion !== this.assetBundleManager.initialAssetBundle.getVersion()) {
            const assetBundle = this.assetBundleManager
                .downloadedAssetBundleWithVersion(lastKnownGoodVersion);
            if (assetBundle && assetBundle.getVersion() !== this.currentAssetBundle.getVersion()) {
                this.log.info(`reverting to last known good version: ${assetBundle.getVersion()}`);
                this.pendingAssetBundle = assetBundle;
            }
        } else if (this.currentAssetBundle.getVersion() !==
            this.assetBundleManager.initialAssetBundle.getVersion()) {
            // Else, revert to the initial asset bundle, unless that is what we are currently
            // serving.
            this.log.info('reverting to initial bundle');
            this.pendingAssetBundle = this.assetBundleManager.initialAssetBundle;
        }

        // Only reload if we have a pending asset bundle to reload.
        if (this.pendingAssetBundle) {
            this.eventsBus.emit('revertVersionReady');
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
     * @param {function} onVersionsCleanedUp - callback to be called after versions dir cleanup
     *
     * @private
     */
    startupDidComplete(onVersionsCleanedUp = Function.prototype) {
        this.log.verbose('startup did complete, stopping startup timer (startup took ' +
            `${Date.now() - this.startupTimerStartTimestamp}ms)`);

        // Remove this version from blacklisted.
        if (~this.config.blacklistedVersions.indexOf(this.currentAssetBundle.getVersion())) {
            this.config.blacklistedVersions.splice(
                this.config.blacklistedVersions.indexOf(this.currentAssetBundle.getVersion()),
                1
            );
            this.saveConfig();
        }

        this.removeStartupTimer();

        // If startup completed successfully, we consider a good version.
        this.config.lastKnownGoodVersion = this.currentAssetBundle.getVersion();
        this.saveConfig();

        this.eventsBus.emit('startupDidComplete');

        setImmediate(() => {
            this.assetBundleManager
                .removeAllDownloadedAssetBundlesExceptForVersion(
                    this.currentAssetBundle
                )
                .then((status) => {
                    // Some of the clearing operations may have failed but we can live with it.
                    if (typeof onVersionsCleanedUp === 'function') {
                        onVersionsCleanedUp(status);
                    }
                    this.module.send('onVersionsCleanedUp', status);
                });
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
     * @param {string} cause - error message
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
     * Fires console.warn on the Meteor app side.
     *
     * @param {string} cause - warn message
     * @private
     */
    notifyWarning(cause) {
        this.module.send(
            'warn',
            `[autoupdate] Warning: ${cause}`
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
        this.notifyNewVersionReady(assetBundle.getVersion(), assetBundle.desktopVersion);
    }

    /**
     * Notify meteor that a new version is ready.
     * @param {string} version        - version string
     * @param {Object} desktopVersion - object with desktop version and compatibility
     *                                  version
     * @private
     */
    notifyNewVersionReady(version, desktopVersion) {
        this.eventsBus.emit('newVersionReady', version, desktopVersion.version);
        this.module.send(
            'onNewVersionReady',
            version, desktopVersion.version
        );
    }

    /**
     * Method that decides whether we are interested in the new bundle that we were notified about.
     * Called by assetBundleManager.
     * @param {AssetManifest} manifest     - manifest of the new bundle
     * @param {null|Object} desktopVersion - version information about the desktop part
     * @returns {boolean}
     */
    shouldDownloadBundleForManifest(manifest, desktopVersion = {}) {
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

        if (desktopVersion) {
            this.log.debug(`got desktop version information: ${desktopVersion.version} ` +
                `(compatibility: ${desktopVersion.compatibilityVersion})`);

            let ignoreCompatibilityVersion = false;

            if ('desktopHCPIgnoreCompatibilityVersion' in this.appSettings) {
                ignoreCompatibilityVersion =
                    this.appSettings.desktopHCPIgnoreCompatibilityVersion;
            }

            if (this.appSettings.compatibilityVersion !== desktopVersion.compatibilityVersion) {
                if (!ignoreCompatibilityVersion) {
                    this.log.warn('Skipping downloading new version because the .desktop ' +
                        'compatibility version have changed and is potentially incompatible.');
                    this.notifyError('Skipping downloading new version because the .desktop ' +
                        'compatibility version have changed and is potentially incompatible ' +
                        `(${this.appSettings.compatibilityVersion} != ` +
                        `${desktopVersion.compatibilityVersion})`);
                    return false;
                }
                this.log.warn('Allowing download of new meteor app version with ' +
                    'potentially incompatible .desktop. (ignoreCompatibilityVersion)');
                this.notifyWarning('Allowing download of new meteor app version with ' +
                    'potentially incompatible .desktop. (ignoreCompatibilityVersion)' +
                    `(${this.appSettings.compatibilityVersion} != ` +
                    `${desktopVersion.compatibilityVersion})`);
            }
        }
        return true;
    }
}
