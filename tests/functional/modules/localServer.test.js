import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
chai.use(sinonChai);
chai.use(dirty);
import sinon from 'sinon';
const { describe, it } = global;
const { expect } = chai;
import fs from 'fs';
import path from 'path';
import shell from 'shelljs';
import paths from '../../helpers/paths';
import LocalServer from '../../../modules/localServer';
import fetch from 'node-fetch';

let localPort;

function getLocalServer(path) {
    return new Promise((resolve, reject) => {
        let localServer = new LocalServer({
            info() {},
            error() {}
        });
        function onStartupFailed() {
            reject();
        }
        function onServerReady(port) {
            localPort = port;
            resolve(localServer);
        }
        function onServerRestarted() {

        }
        localServer.setCallbacks(onStartupFailed, onServerReady, onServerRestarted);
        localServer.init(path);
    });
}

function fetchFromLocalServer(url) {
    return fetch(`http://127.0.0.1:${localPort}${url}`);
}

async function expectIndexPageToBeServed(response) {
    expect(response.status).to.equal(200);
    expect(response.headers.get('Content-Type')).to.contain('text/html');
    const body = await response.text();
    expect(body).to.contain('<title>mobileapp</title>');
}

describe('localServer', () => {


    beforeEach(() => {
    });

    describe('localServer', () => {
        it('should serve index.html for /', async () => {
            const localServer = await getLocalServer(paths.fixtures.bundledWww);
            expectIndexPageToBeServed(await fetchFromLocalServer('/'));
            localServer.httpServerInstance.destroy();
        });
        it('should serve assets based on the URL in the manifest', async () => {
            // The file path is app/some-file, while the URL is /some-file
            const localServer = await getLocalServer(paths.fixtures.bundledWww);
            const response = await fetchFromLocalServer('/some-file');
            expect(response.status).to.equal(200);
            const body = await response.text();
            expect(body).to.contain('some-file');
            localServer.httpServerInstance.destroy();
        });
        it('should serve index.html for any URL that does not correspond to an asset', async () => {
            const localServer = await getLocalServer(paths.fixtures.bundledWww);
            expectIndexPageToBeServed(await fetchFromLocalServer('/anything'));
            localServer.httpServerInstance.destroy();
        });
        it('should serve index.html when accessing an asset through /application', async () => {
            const localServer = await getLocalServer(paths.fixtures.bundledWww);
            expectIndexPageToBeServed(await fetchFromLocalServer('/application/packages/meteor.js'));
            localServer.httpServerInstance.destroy();
        });

        it('should serve index.html for an asset that is not in the manifest', async () => {
            const localServer = await getLocalServer(paths.fixtures.bundledWww);
            expectIndexPageToBeServed(await fetchFromLocalServer('/not-in-manifest'));
            localServer.httpServerInstance.destroy();
        });

        it('should serve index.html when accessing an asset that is not in the manifest through' +
            ' /application', async () => {
            const localServer = await getLocalServer(paths.fixtures.bundledWww);
            expectIndexPageToBeServed(await fetchFromLocalServer('/application/not-in-manifest'));
            localServer.httpServerInstance.destroy();
        });

        it('should not serve index.html for a non-existing /favicon.ico', async () => {
            const localServer = await getLocalServer(paths.fixtures.bundledWww);
            const response = await fetchFromLocalServer('/favicon.ico');
            expect(response.status).to.equal(404);
            localServer.httpServerInstance.destroy();
        });
    });
});
