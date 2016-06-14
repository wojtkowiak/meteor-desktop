// These test were ported and adapted from here
// https://github.com/meteor/cordova-plugin-meteor-webapp/blob/master/tests/www/tests.js

/**
 * Here we will test both localServer and autoupdate.
 *
 * In Cordova integration the local server is embedded in the autoupdate module. In this
 * Electron integration the localServer and autoupdate are decoupled. Of course it is crucial
 * to test both of them - so here we will also test the localServer's ability to serve meteor
 * app correctly from two paths:
 *      main path - where the currently downloaded version is
 *      parent path - where the last bundled version is
 * The currently downloaded version only contains files that have been changed so the app should
 * be served from both paths at the same time.
 *
 * Two similar terms are used below:
 *      meteor server - this is a fake meteor server (the one you would normally have deployed on
 *      your server machine)
 *      local server - this is the local server which is serving the app to the builtin Chrome in
 *      Electron
 */

import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
chai.use(sinonChai);
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;
import paths from '../../helpers/paths';
import MeteorServer from '../../helpers/meteorServer';
import HCPClient from '../../../modules/autoupdate.js';
import fetch from 'node-fetch';
import path from 'path';
import shell from 'shelljs';
import LocalServer from '../../../modules/localServer';
import fs from 'fs';
import { getFakeLogger } from '../../helpers/meteorDesktop';

let meteorServer;
let localServer;
let localServerPort;

function exists(checkPath) {
    try {
        fs.accessSync(checkPath);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Runs fake meteor server and serves a version from the fixtures.
 * @param {string} version
 * @returns {*}
 */
function serveVersion(version) {
    if (!meteorServer) {
        return new Promise((resolve, reject) => {
            meteorServer = new MeteorServer({
                info() {
                },
                error() {
                }
            });
            function onStartupFailed() {
                reject();
            }
            function onServerReady() {
                resolve(meteorServer);
            }
            function onServerRestarted() {
            }
            meteorServer.setCallbacks(onStartupFailed, onServerReady, onServerRestarted);
            meteorServer.init(path.join(paths.fixtures.downloadableVersions, version));
        });
    }
    meteorServer.init(path.join(paths.fixtures.downloadableVersions, version), undefined, true);
    return Promise.resolve(meteorServer);
}

/**
 * Runs a local server - the one which is serving the app to builtin chrome in Electron.
 *
 * @param mainPath
 * @param parentPath
 * @returns {Promise}
 */
function setUpLocalServer(mainPath, parentPath) {
    let resolve;
    let reject;

    function onServerReady(port) {
        localServerPort = port;
        resolve(localServer);
    }
    if (!localServer) {
        return new Promise((promiseResolve, promiseReject) => {
            resolve = promiseResolve;
            reject = promiseReject;
            localServer = new LocalServer({
                info() {
                },
                error() {
                }
            });
            localServer.setCallbacks(() => reject(), onServerReady, () => resolve());
            localServer.init(mainPath, parentPath);
        });
    }
    return new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
        localServer.setCallbacks(() => reject(), onServerReady, () => resolve());
        localServer.init(mainPath, parentPath, true);
    });
}

// Fetches from the local server.
function fetchFromLocalServer(url) {
    return fetch(`http://127.0.0.1:${localServerPort}${url}`);
}

/**
 * Extracts and returns runtime config from index.html.
 * @param html
 */
function runtimeConfigFromHTML(html) {
    const regex = /__meteor_runtime_config__ = JSON.parse\(decodeURIComponent\("([^"]*)"\)\)/;
    const matches = html.match(regex);
    if (!matches) {
        throw new Error('Can\'t find __meteor_runtime_config__');
    }
    return JSON.parse(decodeURIComponent(matches[1]));
}

/**
 * Check for the expected version being served now from local server.
 * @param expectedVersion
 */
async function expectVersionServedToEqual(expectedVersion) {
    const response = await fetchFromLocalServer('/');
    expect(response.status).to.equal(200);
    expect(response.headers.get('Content-Type')).to.contain('text/html');
    const body = await response.text();
    const config = runtimeConfigFromHTML(body);
    const version = config.autoupdateVersionCordova;
    console.log(version, expectedVersion);
    expect(version).to.equal(expectedVersion);
}

/**
 * Prepares the autoupdate module for the tests.
 * It also checks if the version served from the local server from the start is the version we
 * are expecting to be server.
 *
 * @param showLogger
 * @param onNewVersionReady
 * @param expectVersion
 * @returns {HCPClient}
 */
async function setUpAutoupdate(showLogger = false, onNewVersionReady, expectVersion = 'version1') {
    const autoupdate = new HCPClient(
        getFakeLogger(showLogger),
        {}, {},
        // fake systemEvents
        {
            on() {
            },
            emit(event) {
                // We want to catch the newVersionReady systemEvent
                if (event === 'newVersionReady') {
                    onNewVersionReady();
                }
            }
        }, {},
        {
            dataPath: paths.fixtures.autoUpdate,
            bundleStorePath: paths.fixtures.autoUpdate,
            initialBundlePath: paths.fixtures.bundledWww
        },
        class Module {
            on() {
            }

            send() {
            }
        }
    );
    autoupdate._init();
    try {
        await setUpLocalServer(
            autoupdate.getDirectory(), autoupdate.getParentDirectory());
        await expectVersionServedToEqual(expectVersion);
    } catch (e) {
        throw new Error(e);
    }
    return autoupdate;
}

/**
 * Performs a fake reload and a local server restart.
 * Checks if after the restart an expected version is being served.
 * @param autoupdate
 * @param version
 */
async function restartLocalServerAndExpectVersion(autoupdate, version) {
    autoupdate.onReset();
    try {
        await setUpLocalServer(
            autoupdate.getDirectory(), autoupdate.getParentDirectory());
        await expectVersionServedToEqual(version);
    } catch (e) {
        throw new Error(e);
    }
}

/**
 * Checks is a certain asset is currently served from the local server.
 * @param filename
 * @param content
 * @param done
 */
async function expectAssetToBeServed(filename, content, done) {
    const response = await fetchFromLocalServer("/" + filename);
    expect(response.status).to.equal(200);
    const body = await response.text();
    expect(body).to.contain(filename);
}

/**
 * This runs a normal auto update cycle:
 *  - check for updates
 *  - download new version
 *  - restart to switch to a new version
 * After that it runs tests that should be provided in the `testCallback`.
 * Also verifies the version we are expecting to see before the update and after.
 *
 * @param done
 * @param testCallback
 * @param versionExpectedAfter
 * @param versionExpectedBefore
 */
async function runAutoUpdateTests(done, testCallback, versionExpectedAfter, versionExpectedBefore = 'version1') {
    let autoupdate;
    try {
        autoupdate = await setUpAutoupdate(true, async () => {
            try {
                await restartLocalServerAndExpectVersion(autoupdate, versionExpectedAfter);
                await testCallback(autoupdate);
            } catch (e) {
                done(e);
                return;
            }
            done();
        }, versionExpectedBefore);
    } catch (e) {
        done(e);
    }
    autoupdate.checkForUpdates();
}

function cleanup() {
    const autoupdateJson = path.join(paths.fixtures.autoUpdate, 'autoupdate.json');
    const versions = path.join(paths.fixtures.autoUpdate, 'versions');
    if (exists(autoupdateJson)) {
        shell.rm(autoupdateJson);
    }
    if (exists(versions)) {
        shell.rm('-rf', versions);
    }
}

describe('autoupdate', () => {

    describe('when updating from the bundled app version to a downloaded version', () => {
        beforeEach(async() => {
            meteorServer = await serveVersion('version2');
            cleanup();
        });

        afterEach(() => {
            meteorServer.httpServerInstance.destroy();
            localServer.httpServerInstance.destroy();
            localServer = null;
            meteorServer = null;
        });

        it('should only serve the new version after a page reload', async(done) => {
            await runAutoUpdateTests(done, () => {}, 'version2');
        });

        it('should only download changed files', async(done) => {
            await runAutoUpdateTests(done, () => {
                expect(meteorServer.receivedRequests).to.include.members([
                    '/__cordova/manifest.json',
                    '/__cordova/app/template.mobileapp.js',
                    '/__cordova/app/3f6275657e6db3a21acb37d0f6c207cf83871e90.map',
                    '/__cordova/some-file',
                    '/__cordova/some-other-file',
                    '/__cordova/']);
            }, 'version2');
        });
        it('should still serve assets that haven\'t changed', async(done) => {
            await runAutoUpdateTests(done, async() => {
                await expectAssetToBeServed('some-text.txt');
            }, 'version2');
        });

        it('should remember the new version after a restart', async(done) => {
            await runAutoUpdateTests(done, async(autoupdate) => {
                autoupdate.initializeAssetBundles();
                autoupdate.onReset();
                await expectVersionServedToEqual('version2');
            }, 'version2');
        });

    });

    async function downloadAndServeVersionLocally(versionToDownload, versionToServeOnMeteorServer, done) {
        meteorServer = await serveVersion(versionToDownload);
        cleanup();
        await runAutoUpdateTests(done, async () => {
            meteorServer = await serveVersion(versionToServeOnMeteorServer);
        }, versionToDownload);
    }

    describe('when updating from a downloaded app version to another downloaded version', () => {

        beforeEach(async (done) => {
            await downloadAndServeVersionLocally('version2', 'version3', done);
        });

        afterEach(function() {
            meteorServer.httpServerInstance.destroy();
            localServer.httpServerInstance.destroy();
            localServer = null;
            meteorServer = null;
        });

        it("should only serve the new verson after a page reload", async (done) => {
            await runAutoUpdateTests(done, () => {}, 'version3', 'version2');
        });

        it('should only download changed files', async(done) => {
            await runAutoUpdateTests(done, () => {
                expect(meteorServer.receivedRequests).to.include.members([
                    "/__cordova/manifest.json",
                    "/__cordova/",
                    "/__cordova/app/template.mobileapp.js",
                    "/__cordova/app/36e96c1d40459ae12164569599c9c0a203b36db7.map",
                    "/__cordova/some-file"]);
            }, 'version3', 'version2');
        });
        it('should still serve assets that haven\'t changed', async(done) => {
            await runAutoUpdateTests(done, async() => {
                await expectAssetToBeServed('some-text.txt');
            }, 'version3', 'version2');
        });



        it("should delete the old version after startup completes", async (done) => {

            await runAutoUpdateTests(done, async(autoupdate) => {
                expect(
                    autoupdate
                        ._assetBundleManager
                        .downloadedAssetBundleWithVersion('version2')
                ).to.exist();

                autoupdate.startupDidComplete(() => {
                    expect(
                        autoupdate
                            ._assetBundleManager
                            .downloadedAssetBundleWithVersion('version2')
                    ).to.be.null();
                    done();
                });
            }, 'version3', 'version2');
        });
        it('should remember the new version after a restart', async(done) => {
            await runAutoUpdateTests(done, async(autoupdate) => {
                autoupdate.initializeAssetBundles();
                autoupdate.onReset();
                await expectVersionServedToEqual('version3');
            }, 'version3', 'version2');
        });
    });
});

