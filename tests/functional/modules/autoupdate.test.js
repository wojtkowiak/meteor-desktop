/* eslint-disable no-console, global-require */
// These test were ported and adapted from here
// https://github.com/meteor/cordova-plugin-meteor-webapp/blob/master/tests/www/tests.js

/**
 * Here we will test both localServer and autoupdate.
 *
 * !!!You need to have a free port 3788!!!
 *
 * In Cordova integration the local server is embedded in the autoupdate module. In this
 * Electron integration the localServer and autoupdate are decoupled. Of course it is crucial
 * to test both of them - so here we will also test the localServer's ability to serve meteor
 * app correctly from two paths:
 *      main path - where the currently downloaded version is
 *      parent path - where the last bundled version is
 * The downloaded version always only contains files that have been changed so the app should
 * be served from both paths at the same time.
 *
 * Two similar terms are used below:
 *      meteor server - this is a fake meteor server (the one you would normally have deployed on
 *      your server machine)
 *      local server - this is the local server which is serving the app to the builtin Chrome in
 *      Electron
 *
 * Since we have a lot of `async` here it is crucial to cover the significant ones with try/catch.
 *
 * If you need some more debug telling you why a test failed change the 'showLogs` var below the
 * imports section.
 */
import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import path from 'path';
import shell from 'shelljs';
import fs from 'fs';
import mockery from 'mockery';

import mockerySettings from '../../helpers/mockerySettings';
import paths from '../../helpers/paths';
import { serveVersion } from '../../helpers/autoupdate/meteorServer';
import {
    setUpLocalServer, expectVersionServedToEqual,
    shutdownLocalServer, restartLocalServerAndExpectVersion, expectAssetToBeServed,
    expectAssetServedToContain
} from '../../helpers/autoupdate/localServer';
import { getFakeLogger } from '../../helpers/meteorDesktop';

let HCPClient;

chai.use(sinonChai);
chai.use(dirty);
const {
    describe, it, before, after
} = global;
const { expect } = chai;

const showLogs = false;
const showErrors = true;

let meteorServer;

function exists(checkPath) {
    try {
        fs.accessSync(checkPath);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Prepares the autoupdate module for the tests.
 * It also checks if the version served from the local server from the start is the version we
 * are expecting to be served.
 *
 * @param {boolean} printLogs       - whether to print out the logs from autoupdate
 * @param {Function} onNewVersionReady - Function to run on the `onNewVersionReady` system event
 * @param {string} expectedVersion - The version we are expecting to serve from the start
 * @param {Function} errorCallback - The callback which will be fired with autoupdate errors
 * @param {boolean} printErrorLogs - Whether to print errors even if `printLogs` is false
 * @param {boolean} testMode       - Whether to inform autoupdate that this is a test run. Currently
 *                                   when true, autoupdate does not fire the startup timer
 * @returns {HCPClient}
 */
async function setUpAutoupdate(printLogs = false, onNewVersionReady, expectedVersion = 'version1',
    errorCallback = Function.prototype, printErrorLogs = false,
    testMode = true) {
    const autoupdate = new HCPClient({
        log: getFakeLogger(printLogs, printErrorLogs),
        appSettings: {},
        // fake systemEvents
        eventsBus: {
            on() {
            },
            emit(event) {
                // We want to catch the newVersionReady systemEvent
                if (event === 'newVersionReady') {
                    onNewVersionReady();
                }
            }
        },
        settings: {
            dataPath: paths.autoUpdateVersionsPath,
            bundleStorePath: paths.autoUpdateVersionsPath,
            initialBundlePath: paths.fixtures.bundledWww,
            test: testMode,
            webAppStartupTimeout: 200
        },
        Module: class Module {
            constructor() {
                this.on = () => {
                };
            }
            send(event, message) { // eslint-disable-line class-methods-use-this
                if (printLogs) {
                    console.log('module event sent from hcp:', event, message);
                }
                if (event === 'error') {
                    errorCallback(message);
                }
            }
        }
    });
    autoupdate.init();

    autoupdate.window = {
        reload() {
        }
    };
    try {
        await setUpLocalServer(
            autoupdate.getDirectory(), autoupdate.getParentDirectory()
        );
        await expectVersionServedToEqual(expectedVersion);
    } catch (e) {
        throw new Error(e);
    }
    return autoupdate;
}

/**
 * This runs a normal auto update cycle:
 *  - check for updates
 *  - download new version
 *  - restart to switch to a new version
 * After that it runs tests that should be provided in the `testCallback`.
 * Also verifies the versions we are expecting to see before the update and after.
 *
 * @param {Function} done - Callback to fire when done.
 * @param {Function} testCallback - Function with test we want to run after the cycle.
 * @param {string} versionExpectedAfter - Version to expect being served after the cycle.
 * @param {string} versionExpectedBefore - Version to expect being served before the cycle.
 * @param {boolean} doNotCallDone - Whether to not call the done callback.
 * @param {boolean} printErrorLogs - Whether to print errors even if `printLogs` is false.
 * @param {boolean} testMode       - Whether to inform autoupdate that this is a test run. Currently
 *                                   when true, autoupdate does not fire the startup timer.
 */
async function runAutoUpdateTests(done, testCallback, versionExpectedAfter,
    versionExpectedBefore = 'version1', doNotCallDone = false,
    printErrorLogs = showErrors, testMode = true) {
    let autoupdate;
    try {
        autoupdate = await setUpAutoupdate(showLogs, async () => {
            try {
                await restartLocalServerAndExpectVersion(autoupdate, versionExpectedAfter);
                await testCallback(autoupdate);
            } catch (e) {
                done(e);
                return;
            }
            if (!doNotCallDone) {
                done();
            }
        }, versionExpectedBefore, undefined, printErrorLogs, testMode);
    } catch (e) {
        done(e);
    }
    autoupdate.checkForUpdates();
}

/**
 * Cleans up the temporary version directory.
 */
function cleanup() {
    const autoupdateJson = path.join(paths.autoUpdateVersionsPath, 'autoupdate.json');
    const versions = path.join(paths.autoUpdateVersionsPath, 'versions');
    if (exists(autoupdateJson)) {
        shell.rm(autoupdateJson);
    }
    if (exists(versions)) {
        shell.rm('-rf', versions);
    }
}

/**
 * Firstly serves `versionToDownload` on fake meteor server.
 * Runs autoupdate cycle, so the app is updated to the version served.
 * Then switches the fake meteor server to serve now the `versionToServeOnMeteorServer`.
 *
 * @param {string} versionToDownload - Version the autoupdate cycle should download.
 * @param {string} versionToServeOnMeteorServerAfter - Version we want to serve on the fake meteor
 *                          server after the autoupdate cycle is finished.
 * @param {Function} done - Callback to fire when this is done.
 * @param {boolean} confirmVersion - Whether to fire startupDidComplete.
 */
async function downloadAndServeVersionLocally(versionToDownload, versionToServeOnMeteorServerAfter,
    done, confirmVersion = true) {
    try {
        meteorServer = await serveVersion(versionToDownload);
        meteorServer.receivedRequests = [];
    } catch (e) {
        done(e);
    }
    cleanup();
    await runAutoUpdateTests(done, async (autoupdate) => {
        if (confirmVersion) {
            autoupdate.startupDidComplete();
        }
        try {
            meteorServer = await serveVersion(versionToServeOnMeteorServerAfter);
        } catch (e) {
            throw new Error(e);
        }
    }, versionToDownload);
}


/**
 * Tries to close and cleanup the fake meteor server.
 */
function shutdownMeteorServer() {
    meteorServer.httpServerInstance.close();
    meteorServer.httpServerInstance.destroy();
    meteorServer.receivedRequests = [];
    // meteorServer = null;
}

function waitForTestToFail(delay, done) {
    setTimeout(() => {
        done();
    }, delay);
}

function wait(delay) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), delay);
    });
}

describe('autoupdate', () => {
    before(() => {
        shell.rm('-rf', paths.autoUpdateVersionsPath);
        shell.mkdir('-p', paths.autoUpdateVersionsPath);
        mockery.registerMock('original-fs', fs);
        mockery.enable(mockerySettings);
        HCPClient = require('../../../skeleton/modules/autoupdate.js').default;
    });

    after(() => {
        mockery.deregisterMock('original-fs');
        mockery.disable();
    });

    describe('when updating from the bundled app version to a downloaded version', () => {
        beforeEach(async () => {
            try {
                meteorServer = await serveVersion('version2');
            } catch (e) {
                throw new Error(e);
            }
            cleanup();
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should only serve the new version after a page reload', (done) => {
            runAutoUpdateTests(done, Function.prototype, 'version2');
        });

        it('should only download changed files', (done) => {
            meteorServer.receivedRequests = [];
            runAutoUpdateTests(done, () => {
                expect(meteorServer.receivedRequests).to.include.members([
                    '/__cordova/manifest.json',
                    '/__cordova/app/template.mobileapp.js',
                    '/__cordova/app/3f6275657e6db3a21acb37d0f6c207cf83871e90.map',
                    '/__cordova/some-file',
                    '/__cordova/some-other-file',
                    '/__cordova/']);
                expect(meteorServer.receivedRequests).to.have.a.lengthOf(6);
            }, 'version2');
        });

        it('should still serve assets that haven\'t changed', (done) => {
            runAutoUpdateTests(done, async () => {
                await expectAssetToBeServed('some-text.txt');
            }, 'version2');
        });

        it('should remember the new version after a restart', (done) => {
            runAutoUpdateTests(done, async (autoupdate) => {
                autoupdate.initializeAssetBundles();
                autoupdate.onReset();
                await expectVersionServedToEqual('version2');
            }, 'version2');
        });
    });

    describe('when updating from a downloaded app version to another downloaded version', () => {
        beforeEach((done) => {
            downloadAndServeVersionLocally('version2', 'version3', done);
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should only serve the new verson after a page reload', (done) => {
            runAutoUpdateTests(done, Function.prototype, 'version3', 'version2');
        });

        it('should only download changed files', (done) => {
            meteorServer.receivedRequests = [];
            runAutoUpdateTests(done, () => {
                expect(meteorServer.receivedRequests).to.include.members([
                    '/__cordova/manifest.json',
                    '/__cordova/',
                    '/__cordova/app/template.mobileapp.js',
                    '/__cordova/app/36e96c1d40459ae12164569599c9c0a203b36db7.map',
                    '/__cordova/some-file']);
                expect(meteorServer.receivedRequests).to.have.a.lengthOf(5);
            }, 'version3', 'version2');
        });

        it('should still serve assets that haven\'t changed', (done) => {
            runAutoUpdateTests(done, async () => {
                await expectAssetToBeServed('some-text.txt');
            }, 'version3', 'version2');
        });

        it('should delete the old version after startup completes', (done) => {
            runAutoUpdateTests(done, async (autoupdate) => {
                expect(
                    autoupdate
                        .assetBundleManager
                        .downloadedAssetBundleWithVersion('version2')
                ).to.exist();

                autoupdate.startupDidComplete((status) => {
                    expect(status[0].state).to.be.true();
                    expect(
                        autoupdate
                            .assetBundleManager
                            .downloadedAssetBundleWithVersion('version2')
                    ).to.not.exist();
                    done();
                });
            }, 'version3', 'version2', true);
        });

        it('should remember the new version after a restart', (done) => {
            runAutoUpdateTests(done, async (autoupdate) => {
                autoupdate.initializeAssetBundles();
                autoupdate.onReset();
                await expectVersionServedToEqual('version3');
            }, 'version3', 'version2');
        });
    });

    describe('when updating from a downloaded app version to the bundled version', () => {
        beforeEach((done) => {
            downloadAndServeVersionLocally('version2', 'version1', done);
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should only serve the new verson after a page reload', (done) => {
            runAutoUpdateTests(done, Function.prototype, 'version1', 'version2');
        });

        it('should only download the manifest', (done) => {
            meteorServer.receivedRequests = [];
            runAutoUpdateTests(done, () => {
                expect(meteorServer.receivedRequests).to.deep.equal([
                    '/__cordova/manifest.json'
                ]);
            }, 'version1', 'version2');
        });

        it('should still serve assets that haven\'t changed', (done) => {
            runAutoUpdateTests(done, () => {
                expectAssetToBeServed('some-text.txt');
            }, 'version1', 'version2');
        });

        it('should not redownload the bundled version', (done) => {
            runAutoUpdateTests(done, (autoupdate) => {
                expect(
                    autoupdate
                        .assetBundleManager
                        .downloadedAssetBundleWithVersion('version1')
                ).to.not.exist();
            }, 'version1', 'version2');
        });

        it('should delete the old version after startup completes', (done) => {
            runAutoUpdateTests(done, (autoupdate) => {
                expect(
                    autoupdate
                        .assetBundleManager
                        .downloadedAssetBundleWithVersion('version2')
                ).to.exist();

                autoupdate.startupDidComplete((status) => {
                    expect(status[0].state).to.be.true();
                    expect(
                        autoupdate
                            .assetBundleManager
                            .downloadedAssetBundleWithVersion('version2')
                    ).to.not.exist();
                    done();
                });
            }, 'version1', 'version2', true);
        });

        it('should remember the new version after a restart', (done) => {
            runAutoUpdateTests(done, async (autoupdate) => {
                autoupdate.initializeAssetBundles();
                autoupdate.onReset();
                await expectVersionServedToEqual('version1');
            }, 'version1', 'version2');
        });
    });

    describe('when checking for updates while there is no new version', () => {
        beforeEach((done) => {
            downloadAndServeVersionLocally('version2', 'version2', done);
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should not invoke the onNewVersionReady callback', (done) => {
            runAutoUpdateTests(done, () => {
                done('onVersionReady invoked unexpectedly');
            }, 'version2', 'version2');
            waitForTestToFail(1000, done);
        });

        it('should not download any files except for the manifest', (done) => {
            setUpAutoupdate(showLogs, () => {
            }, 'version2', undefined, showErrors).then((autoupdate) => {
                meteorServer.receivedRequests = [];
                setTimeout(() => {
                    expect(meteorServer.receivedRequests).to.deep.equal([
                        '/__cordova/manifest.json'
                    ]);
                    done();
                }, 500);
                autoupdate.checkForUpdates();
            });
        });
    });

    describe('when downloading a missing asset', () => {
        beforeEach(async () => {
            try {
                meteorServer = await serveVersion('version2_with_missing_asset');
            } catch (e) {
                throw new Error(e);
            }
            cleanup();
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should invoke the onError callback with an error', (done) => {
            setUpAutoupdate(showLogs, () => {
            }, 'version1', (error) => {
                expect(error).to.include('non-success status code 404 for asset:' +
                    ' app/template.mobileapp.js');
                done();
            }, false).then((autoupdate) => {
                autoupdate.checkForUpdates();
            });
        });

        it('should not invoke the onNewVersionReady callback', (done) => {
            runAutoUpdateTests(done, () => {
                done('onVersionReady invoked unexpectedly');
            }, 'version2_with_missing_asset', 'version1', false, false);
            waitForTestToFail(1000, done);
        });
    });

    describe('when downloading an invalid asset', () => {
        beforeEach(async () => {
            try {
                meteorServer = await serveVersion('version2_with_invalid_asset');
            } catch (e) {
                throw new Error(e);
            }
            cleanup();
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should invoke the onError callback with an error', (done) => {
            setUpAutoupdate(showLogs, () => {
            }, 'version1', (error) => {
                expect(error).to.include('hash mismatch for asset: ' +
                    'app/template.mobileapp.js');
                done();
            }, false).then(autoupdate => autoupdate.checkForUpdates());
        });

        it('should not invoke the onNewVersionReady callback', async (done) => {
            await runAutoUpdateTests(done, () => {
                done('onVersionReady invoked unexpectedly');
            }, 'version2_with_invalid_asset', 'version1', false, false);
            waitForTestToFail(1000, done);
        });
    });

    describe('when downloading an index page with the wrong version', () => {
        beforeEach(async () => {
            meteorServer = await serveVersion('version2_with_version_mismatch');
            cleanup();
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should invoke the onError callback with an error', (done) => {
            setUpAutoupdate(showLogs, () => {
            }, 'version1', (error) => {
                expect(error).to.include('version mismatch for index page, expected: version2,' +
                    ' actual: version3');
                done();
            }, false).then(autoupdate => autoupdate.checkForUpdates());
        });

        it('should not invoke the onNewVersionReady callback', (done) => {
            runAutoUpdateTests(done, () => {
                done('onVersionReady invoked unexpectedly');
            }, 'version2_with_version_mismatch', 'version1', false, false);
            waitForTestToFail(1000, done);
        });
    });

    describe('when downloading an index page with a missing ROOT_URL', () => {
        beforeEach(async () => {
            try {
                meteorServer = await serveVersion('missing_root_url');
            } catch (e) {
                throw new Error(e);
            }
            cleanup();
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should invoke the onError callback with an error', (done) => {
            setUpAutoupdate(showLogs, () => {
            }, 'version1', (error) => {
                expect(error).to.include('could not find ROOT_URL in downloaded asset bundle');
                done();
            }, false).then(autoupdate => autoupdate.checkForUpdates());
        });

        it('should not invoke the onNewVersionReady callback', (done) => {
            runAutoUpdateTests(done, () => {
                done('onVersionReady invoked unexpectedly');
            }, 'missing_root_url', 'version1', false, false);
            waitForTestToFail(1000, done);
        });
    });

    describe('when downloading an index page with the wrong ROOT_URL', () => {
        beforeEach(async (done) => {
            await downloadAndServeVersionLocally('127.0.0.1_root_url', 'wrong_root_url', done);
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should invoke the onError callback with an error', async (done) => {
            const autoupdate = await setUpAutoupdate(showLogs, () => {
            }, '127.0.0.1_root_url', (error) => {
                expect(error).to.include('ROOT_URL in downloaded asset bundle would change ' +
                    'current ROOT_URL to localhost.');
                done();
            }, false);
            autoupdate.checkForUpdates();
        });

        it('should not invoke the onNewVersionReady callback', (done) => {
            runAutoUpdateTests(done, () => {
                done('onVersionReady invoked unexpectedly');
            }, 'wrong_root_url', '127.0.0.1_root_url', false, false);
            waitForTestToFail(1000, done);
        });
    });

    describe('when downloading an index page with a missing appId', () => {
        beforeEach(async () => {
            try {
                meteorServer = await serveVersion('missing_app_id');
            } catch (e) {
                throw new Error(e);
            }
            cleanup();
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should invoke the onError callback with an error', (done) => {
            setUpAutoupdate(showLogs, () => {
            }, 'version1', (error) => {
                expect(error).to.include('could not find appId in downloaded asset bundle');
                done();
            }, false).then(autoupdate => autoupdate.checkForUpdates());
        });

        it('should not invoke the onNewVersionReady callback', (done) => {
            runAutoUpdateTests(done, () => {
                done('onVersionReady invoked unexpectedly');
            }, 'missing_app_id', 'version1', false, false);
            waitForTestToFail(1000, done);
        });
    });

    describe('when downloading an index page with the wrong appId', () => {
        beforeEach(async () => {
            try {
                meteorServer = await serveVersion('wrong_app_id');
            } catch (e) {
                throw new Error(e);
            }
            cleanup();
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should invoke the onError callback with an error', (done) => {
            setUpAutoupdate(showLogs, () => {
            }, 'version1', (error) => {
                expect(error).to.include('appId in downloaded asset bundle does not match ' +
                    'current appId');
                done();
            }, false).then(autoupdate => autoupdate.checkForUpdates());
        });

        it('should not invoke the onNewVersionReady callback', (done) => {
            runAutoUpdateTests(done, () => {
                done('onVersionReady invoked unexpectedly');
            }, 'wrong_app_id', 'version1', false, false);
            waitForTestToFail(1000, done);
        });
    });

    describe('when downloading a version with a missing cordovaCompatibilityVersion', () => {
        beforeEach(async () => {
            try {
                meteorServer = await serveVersion('missing_cordova_compatibility_version');
            } catch (e) {
                throw new Error(e);
            }
            cleanup();
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should invoke the onError callback with an error', (done) => {
            setUpAutoupdate(showLogs, () => {
            }, 'version1', (error) => {
                expect(error).to.include('Asset manifest does not have a ' +
                    'cordovaCompatibilityVersion');
                done();
            }, false).then(autoupdate => autoupdate.checkForUpdates());
        });

        it('should not invoke the onNewVersionReady callback', (done) => {
            runAutoUpdateTests(done, () => {
                done('onVersionReady invoked unexpectedly');
            }, 'missing_cordova_compatibility_version', 'version1', false, false);
            waitForTestToFail(1000, done);
        });
    });

    // Commented out as the cordova compatibility check is disabled in this autoupdate integration.
    // That is of course because we have Electron, not Cordova integration.
    /*
     describe('when downloading a version with a different cordovaCompatibilityVersion', () => {
     beforeEach(async () => {
     try {
     meteorServer = await serveVersion('different_cordova_compatibility_version');
     } catch (e) {
     throw new Error(e);
     }
     cleanup();
     });
     afterEach(() => {
     closeMeteorServer();
     shutdownLocalServer();
     });
     it('should invoke the onError callback with an error', async (done) => {
     const autoupdate = await setUpAutoupdate(false, () => {
     }, 'version1', (error) => {
     expect(error).to.include('Skipping downloading new version because the Cordova ' +
     'platform version or plugin versions have changed and are potentially ' +
     'incompatible');
     done();
     });
     autoupdate.checkForUpdates();
     });

     it('should not invoke the onNewVersionReady callback', async (done) => {
     await runAutoUpdateTests(done, () => {
     done('onVersionReady invoked unexpectedly');
     }, 'different_cordova_compatibility_version', 'version1');
     waitForTestToFail(1000, done);
     });
     });
     */

    describe('when resuming a partial download with the same version', () => {
        let autoupdate;
        beforeEach((done) => {
            cleanup();
            const downloadingPath = path.join(
                paths.autoUpdateVersionsPath, 'Downloading'
            );
            if (exists(downloadingPath)) {
                shell.rm('-rf', downloadingPath);
            }
            shell.mkdir(downloadingPath);
            shell.cp('-r', path.join(
                paths.fixtures.partiallyDownloadableVersions, 'version2', '*'
            ), downloadingPath);
            serveVersion('version2').then((result) => {
                meteorServer = result;
                meteorServer.receivedRequests = [];
                setUpAutoupdate(showLogs, () => {
                    done();
                }, 'version1', undefined, showErrors)
                    .then((_autoupdate) => {
                        autoupdate = _autoupdate;
                        autoupdate.checkForUpdates();
                    });
            });
        });
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should only download the manifest, the index page, and the remaining assets', () => {
            expect(meteorServer.receivedRequests).to.include.members([
                '/__cordova/manifest.json',
                '/__cordova/',
                '/__cordova/app/template.mobileapp.js',
                '/__cordova/app/3f6275657e6db3a21acb37d0f6c207cf83871e90.map']);
        });

        it('should only serve the new version after a page reload', async () => {
            await restartLocalServerAndExpectVersion(autoupdate, 'version2');
        });

        it('should serve assets that have been downloaded before', async () => {
            await restartLocalServerAndExpectVersion(autoupdate, 'version2');
            await expectAssetServedToContain('some-file', 'some-file (changed)');
        });
    });

    describe('when resuming a partial download with a different version', () => {
        let autoupdate;
        beforeEach((done) => {
            cleanup();
            const downloadingPath = path.join(
                paths.autoUpdateVersionsPath, 'Downloading'
            );
            if (exists(downloadingPath)) {
                shell.rm('-rf', downloadingPath);
            }
            shell.mkdir(downloadingPath);
            shell.cp('-r', path.join(
                paths.fixtures.partiallyDownloadableVersions, 'version2', '*'
            ), downloadingPath);
            serveVersion('version3').then((_meteorServer) => {
                meteorServer = _meteorServer;
                meteorServer.receivedRequests = [];
                setUpAutoupdate(showLogs, async () => {
                    done();
                }, 'version1', undefined, showErrors).then((_autoupdate) => {
                    autoupdate = _autoupdate;
                    autoupdate.checkForUpdates();
                });
            });
        });

        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should only download the manifest, the index page, and the remaining assets', () => {
            expect(meteorServer.receivedRequests).to.include.members([
                '/__cordova/manifest.json',
                '/__cordova/',
                '/__cordova/app/template.mobileapp.js',
                '/__cordova/app/36e96c1d40459ae12164569599c9c0a203b36db7.map',
                '/__cordova/some-file']);
        });

        it('should only serve the new verson after a page reload', async () => {
            await restartLocalServerAndExpectVersion(autoupdate, 'version3');
        });

        it('should serve assets that have been downloaded before', async () => {
            await restartLocalServerAndExpectVersion(autoupdate, 'version3');
            await expectAssetToBeServed('some-other-file');
        });

        it('should serve changed assets even if they have been downloaded before', async () => {
            await restartLocalServerAndExpectVersion(autoupdate, 'version3');
            await expectAssetServedToContain('some-file', 'some-file (changed again)');
        });
    });

    /**
     * Additional tests that are going beyond what is currently tested in the meteor cordova webapp.
     */

    describe('when startupDidComplete is not fired', () => {
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
            cleanup();
        });

        it('should fallback to last known good version', (done) => {
            downloadAndServeVersionLocally('version2', 'version3', () => {
                runAutoUpdateTests(
                    done,
                    async (autoupdate) => {
                        await wait(500);
                        expect(autoupdate.getPendingVersion()).to.equal('version2');
                        expect(autoupdate.config.blacklistedVersions).to.contain('version3');
                        done();
                    },
                    'version3', 'version2', true, undefined, false
                );
            });
        });

        it('should fallback to initial asset bundle', (done) => {
            serveVersion('version2').then((result) => {
                meteorServer = result;
                runAutoUpdateTests(
                    done,
                    async (autoupdate) => {
                        await wait(500);
                        expect(autoupdate.getPendingVersion()).to.equal('version1');
                        expect(autoupdate.config.blacklistedVersions).to.contain('version2');
                        done();
                    },
                    'version2', 'version1', true, undefined, false
                );
            });
        });
    });

    describe('when version is blacklisted', () => {
        afterEach(() => {
            shutdownMeteorServer();
            shutdownLocalServer();
        });

        it('should not download it', (done) => {
            serveVersion('version2').then((result) => {
                meteorServer = result;
                return setUpAutoupdate(showLogs, () => {}, 'version1', (error) => {
                    expect(error).to.include('skipping downloading blacklisted version');
                    done();
                }, false);
            }).then((autoupdate) => {
                autoupdate.config.blacklistedVersions = ['version2'];
                autoupdate.checkForUpdates();
            });
        });
    });
});
