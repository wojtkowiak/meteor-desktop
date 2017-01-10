import path, { join } from 'path';
import fs from 'fs';

export default class DesktopPathResolver {

    /**
     * Reads a json file.
     * @returns {Object}
     */
    static readJsonFile(jsonFilePath) {
        try {
            return JSON.parse(fs.readFileSync(jsonFilePath, 'UTF-8'));
        } catch (e) {
            return {};
        }
    }

    /**
     * Reads meteor app version from the initial asset bundle.
     * @returns {string}
     */
    static readInitialAssetBundleVersion() {
        const initialAssetBundleManifestPath =
            path.resolve(join(__dirname, '..', 'meteor.asar', 'program.json'));

        return DesktopPathResolver.readJsonFile(initialAssetBundleManifestPath).version;
    }


    /**
     * Tries to read information about bundled desktop version.
     *
     * @param {string} userDataDir - user data path
     * @param {string} version     - meteor app version
     * @returns {Object}
     */
    static readDesktopVersionInfoFromBundle(userDataDir, version) {
        return DesktopPathResolver
            .readJsonFile(join(userDataDir, 'versions', version, '_desktop.json'));
    }


    /**
     * Decides where the current desktop.asar lies. Takes into account desktopHCP.
     * Also supports falling back to last known good version Meteor mechanism.
     *
     * @param {string} userDataDir - user data path
     * @param {Log}    log         - App's logger instance
     */
    static resolveDesktopPath(userDataDir, log) {
        // TODO: kinda the same logic is in the autoupdate module - extract it to common place.

        let desktopPath = path.resolve(join(__dirname, '..', 'desktop.asar'));

        const initialDesktopVersion =
            DesktopPathResolver.readJsonFile(join(desktopPath, 'settings.json')).desktopVersion;

        log.info('initial desktop version is ', initialDesktopVersion);

        // Read meteor's initial asset bundle version.
        const initialVersion = DesktopPathResolver.readInitialAssetBundleVersion();

        this.autoupdate = null;
        const autoupdateConfig =
            DesktopPathResolver.readJsonFile(join(userDataDir, 'autoupdate.json'));

        if (autoupdateConfig.lastSeenInitialVersion !== initialVersion) {
            log.warn('will use desktop.asar from initial version because the initial version ' +
            `of meteor app has changed: ${desktopPath}`);
            return desktopPath;
        }

        if (autoupdateConfig.lastDownloadedVersion) {
            // We have a last downloaded version.
            if (~autoupdateConfig.blacklistedVersions.indexOf(
                autoupdateConfig.lastDownloadedVersion)
            ) {
                // If it is blacklisted lets check if we have last known good version.
                if (autoupdateConfig.lastKnownGoodVersion) {
                    // But is the last know good version different from the initial version?
                    if (autoupdateConfig.lastKnownGoodVersion !==
                        autoupdateConfig.lastSeenInitialVersion
                    ) {
                        const desktopVersion =
                            DesktopPathResolver.readDesktopVersionInfoFromBundle(
                                userDataDir,
                                autoupdateConfig.lastKnownGoodVersion
                            );

                        // TODO: can we assume that desktopHCP is on?
                        if (desktopVersion.version) {
                            if (desktopVersion.version !== initialDesktopVersion) {
                                desktopPath =
                                    path.resolve(join(
                                        userDataDir,
                                        `${desktopVersion.version}_desktop.asar`
                                    ));
                                log.warn('will use desktop.asar from last known good version ' +
                                    `at: ${desktopPath}`);
                            } else {
                                log.warn('will use desktop.asar from initial version because ' +
                                    'last known good version of meteor app is using it: ' +
                                    `${desktopPath}`);
                            }
                        } else {
                            log.warn('will use desktop.asar from initial version because last ' +
                                'known good version of meteor app does not contain new desktop ' +
                                `version : ${desktopPath}`);
                        }
                    } else {
                        log.info('will use desktop.asar from last known good version which is ' +
                            `apparently the initial bundle: ${desktopPath}`);
                    }
                } else {
                    log.warn('will use desktop.asar from initial version as a fallback: ' +
                        `${desktopPath}`);
                }
            } else if (autoupdateConfig.lastDownloadedVersion !==
                    autoupdateConfig.lastSeenInitialVersion
            ) {
                const desktopVersion =
                    this.readDesktopVersionInfoFromBundle(
                        userDataDir,
                        autoupdateConfig.lastDownloadedVersion
                    );
                if (desktopVersion.version) {
                    if (desktopVersion.version !== initialDesktopVersion) {
                        desktopPath = path.resolve(join(
                            userDataDir,
                            `${desktopVersion.version}_desktop.asar`));
                        log.info('will use desktop.asar from last downloaded version ' +
                            `at: ${desktopPath}`);
                    } else {
                        log.warn('will use desktop.asar from initial version because last ' +
                            `downloaded version is using it: ${desktopPath}`);
                    }
                } else {
                    log.warn('will use desktop.asar from initial version because last ' +
                        'downloaded version does not contain new desktop version: ' +
                        `${desktopPath}`);
                }
            } else {
                log.info('will use desktop.asar from last downloaded version which is ' +
                    `apparently the initial bundle: ${desktopPath}`);
            }
        } else {
            log.info(`using desktop.asar from initial bundle: ${desktopPath}`);
        }
        return desktopPath;
    }

}
