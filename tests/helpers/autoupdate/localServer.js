import LocalServer from '../../../modules/localServer';
import fetch from 'node-fetch';
import chai from 'chai';
import dirty from 'dirty-chai';
chai.use(dirty);
const { expect } = chai;

let localServer;
let localServerPort;

/**
 * Runs a local server - the one which is serving the app to builtin chrome in Electron.
 *
 * @param mainPath
 * @param parentPath
 * @returns {Promise}
 */
export function setUpLocalServer(mainPath, parentPath) {
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
export function fetchFromLocalServer(url) {
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
export async function expectVersionServedToEqual(expectedVersion) {
    const response = await fetchFromLocalServer('/');
    expect(response.status).to.equal(200);
    expect(response.headers.get('Content-Type')).to.contain('text/html');
    const body = await response.text();
    const config = runtimeConfigFromHTML(body);
    const version = config.autoupdateVersionCordova;
    expect(version).to.equal(expectedVersion);
}


export function shutdownLocalServer() {
    localServer.httpServerInstance.close();
    localServer.httpServerInstance.destroy();
    localServer = null;
}

/**
 * Performs a fake reload and a local server restart.
 * Checks if after the restart an expected version is being served.
 * @param autoupdate
 * @param version
 */
export async function restartLocalServerAndExpectVersion(autoupdate, version) {
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
export async function expectAssetToBeServed(filename, content, done) {
    const response = await fetchFromLocalServer(`/${filename}`);
    expect(response.status).to.equal(200);
    const body = await response.text();
    expect(body).to.contain(filename);
}


module.exports = { setUpLocalServer, fetchFromLocalServer, expectVersionServedToEqual,
    shutdownLocalServer, restartLocalServerAndExpectVersion, expectAssetToBeServed };
