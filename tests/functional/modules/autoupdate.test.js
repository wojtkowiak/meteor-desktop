// These test were ported and adapted from here
// https://github.com/meteor/cordova-plugin-meteor-webapp/blob/master/tests/www/tests.js

/**
 * Since the localServer and autoupdate are decoupled but for theses test it is crucial to test
 * both of them - here we will also partially test localServer.
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
 * Runs fake meteor server and server a version from the fixtures.
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
    meteorServer.init(path.join(paths.fixtures.downloadableVersions, version));
    return Promise.resolve();
}

/**
 * Runs a local server - the one which is normally serving the app to builtin chrome in Electron.
 *
 * @param mainPath
 * @param parentPath
 * @param restart
 * @returns {Promise}
 */
function setUpLocalServer(mainPath, parentPath, restart) {
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
            localServer.init(mainPath, parentPath, restart);
        });
    }
    return new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
        localServer.setCallbacks(() => reject(), onServerReady, () => resolve());
        localServer.init(mainPath, parentPath, restart);
    });
}

// Fetches from the local server (the one that cooperates with autoupdate).
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


async function getServedVersion() {
    const response = await fetchFromLocalServer('/');
    expect(response.status).to.equal(200);
    expect(response.headers.get('Content-Type')).to.contain('text/html');
    const body = await response.text();
    const config = runtimeConfigFromHTML(body);
    const version = config.autoupdateVersionCordova;
    console.log('served ver', version);
    return version;

}

function setUpAutoupdate(showLogger = false, onNewVersionReady) {
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
    return autoupdate;
}

describe('autoupdate', () => {
    describe('when updating from the bundled app version to a downloaded version', () => {
        beforeEach(async() => {
            meteorServer = await serveVersion('version2');
            const autoupdateJson = path.join(paths.fixtures.autoUpdate, 'autoupdate.json');
            const versions = path.join(paths.fixtures.autoUpdate, 'versions');
            if (exists(autoupdateJson)) {
                shell.rm(autoupdateJson);
            }
            if (exists(versions)) {
                shell.rm('-rf', versions);
            }
        });

        afterEach(() => {
            meteorServer.httpServerInstance.destroy();
            localServer.httpServerInstance.destroy();
            localServer = null;
            meteorServer = null;
        });

        it('should only serve the new version after a page reload', async(done) => {
            const autoupdate = setUpAutoupdate(false, async() => {
                autoupdate.onReset();
                try {
                    await setUpLocalServer(
                        autoupdate.getDirectory(), autoupdate.getParentDirectory(), true);
                } catch (e) {
                    done(e);
                    return;
                }
                try {
                    await expectVersionServedToEqual('version2');
                } catch (e) {
                    done(e);
                    return;
                }
                done();
            });

            try {
                await setUpLocalServer(
                    autoupdate.getDirectory(), autoupdate.getParentDirectory());
                await expectVersionServedToEqual('version1');
            } catch (e) {
                done(e);
                return;
            }
            autoupdate.checkForUpdates();
        });
    });
});

