// These test were ported and adapted from here
// https://github.com/meteor/cordova-plugin-meteor-webapp/blob/master/tests/www/tests.js

/**
 * Here we are only testing if the localServer is able to serve the meteor app from one path
 * correctly (the situation after normal app install where we have a bundled meteor app version).
 */

import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import fetch from 'node-fetch';

import paths from '../../helpers/paths';
import LocalServer from '../../../skeleton/modules/localServer';

chai.use(sinonChai);
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;

let localPort;
// const oneYearInSeconds = 60 * 60 * 24 * 365;

function getLocalServer(path) {
    return new Promise((resolve, reject) => {
        const localServer = new LocalServer({
            loggers: {
                get: () => ({
                    warn() {},
                    info() {}
                })
            }
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
    let localServer;

    before(async () => {
        localServer = await getLocalServer(paths.fixtures.bundledWww);
    });

    after(() => {
        localServer.httpServerInstance.destroy();
    });

    describe('the local server', () => {
        it('should serve index.html for /', async () => {
            expectIndexPageToBeServed(await fetchFromLocalServer('/'));
        });
        it('should serve assets based on the URL in the manifest', async () => {
            // The file path is app/some-file, while the URL is /some-file
            const response = await fetchFromLocalServer('/some-file');
            expect(response.status).to.equal(200);
            const body = await response.text();
            expect(body).to.contain('some-file');
        });
        it('should serve index.html for any URL that does not correspond to an asset', async () => {
            expectIndexPageToBeServed(await fetchFromLocalServer('/anything'));
        });
        it('should serve index.html when accessing an asset through /application', async () => {
            expectIndexPageToBeServed(
                await fetchFromLocalServer('/application/packages/meteor.js'));
        });

        it('should serve index.html for an asset that is not in the manifest', async () => {
            expectIndexPageToBeServed(await fetchFromLocalServer('/not-in-manifest'));
        });

        it('should serve index.html when accessing an asset that is not in the manifest through' +
            ' /application', async () => {
            expectIndexPageToBeServed(await fetchFromLocalServer('/application/not-in-manifest'));
        });

        it('should not serve index.html for a non-existing /favicon.ico', async () => {
            const response = await fetchFromLocalServer('/favicon.ico');
            expect(response.status).to.equal(404);
        });

        it('should set the X-SourceMap header for an asset with a source map', async () => {
            const response = await fetchFromLocalServer('/app/template.mobileapp.js');
            expect(response.headers.get('X-SourceMap')).to.contain(
                '/app/template.mobileapp.js.map');
        });

        it('should serve the source map for an asset', async () => {
            const response = await fetchFromLocalServer('/app/template.mobileapp.js.map');
            expect(response.status).to.equal(200);
            const body = await response.text();
            // Not supported now.
            // expect(response.headers.get('Cache-Control')).to.contain(
            //  'max-age=' + oneYearInSeconds);
            expect(body).to.contain('"sources":["meteor://💻app/template.mobileapp.js"]');
        });

        describe('when setting the Content-Type header', () => {
            it('should set application/javascript for a manifest entry of type: js', async () => {
                const response = await fetchFromLocalServer('/packages/meteor.js');
                expect(response.headers.get('Content-Type')).to.equal('application/javascript');
            });
        });

        it('should set text/css for a manifest entry of type: css', async () => {
            const response = await fetchFromLocalServer('/merged-stylesheets.css');
            expect(response.headers.get('Content-Type')).to.contain('text/css');
        });

        describe('for a manifest entry of type: asset', () => {
            it('should set text/html for a .html file', async () => {
                const response = await fetchFromLocalServer('/some-page.html');
                expect(response.headers.get('Content-Type')).to.contain('text/html');
            });

            it('should set text/javascript for a .js file', async () => {
                const response = await fetchFromLocalServer('/some-javascript.js');
                expect(response.headers.get('Content-Type')).to.equal('application/javascript');
            });

            it('should set text/css for a .css file', async () => {
                const response = await fetchFromLocalServer('/some-stylesheet.css');
                expect(response.headers.get('Content-Type')).to.contain('text/css');
            });

            it('should set application/json for a .json file', async () => {
                const response = await fetchFromLocalServer('/some-data.json');
                expect(response.headers.get('Content-Type')).to.contain('application/json');
            });

            it('should set text/plain for a .txt file', async () => {
                const response = await fetchFromLocalServer('/some-text.txt');
                expect(response.headers.get('Content-Type')).to.contain('text/plain');
            });

            it('should set image/png for a .png file', async () => {
                const response = await fetchFromLocalServer('/some-image.png');
                expect(response.headers.get('Content-Type')).to.contain('image/png');
            });

            it('should set image/jpeg for a .jpg file', async () => {
                const response = await fetchFromLocalServer('/some-image.jpg');
                expect(response.headers.get('Content-Type')).to.contain('image/jpeg');
            });

            it('should set video/mp4 for a .mp4 file', async () => {
                const response = await fetchFromLocalServer('/some-video.mp4');
                expect(response.headers.get('Content-Type')).to.contain('video/mp4');
            });

            it('should set application/woff for a .woff file', async () => {
                const response = await fetchFromLocalServer('/some-font.woff');
                expect(response.headers.get('Content-Type')).to.contain('application/font-woff');
            });

            it('should set application/octet-stream for files without an extension', async () => {
                const response = await fetchFromLocalServer('/some-file');
                expect(response.headers.get('Content-Type')).to.contain('application/octet-stream');
            });
        });
    });
});


// TODO: When we will switch to reading manifest in localServer, comply also to these:
/*

it("should set the ETag header based on the asset hash", function(done) {
    pendingOnAndroid();

    fetchFromLocalServer("/packages/meteor.js").then(function(response) {
        expect(response.headers.get("ETag")).toContain("57d11a30155349aa5106f8150cee35eac5f4764c");
        done();
    });
});

it("should set the Cache-Control header with a max-age of one year for a request with a
    cache buster", function(done) {
    pendingOnAndroid();

    fetchFromLocalServer("/packages/meteor.js?9418708e9519b747d9d631d85ea85b90c0b5c70c")
    .then(function(response) {
        expect(response.headers.get("Cache-Control")).toContain("max-age=" + oneYearInSeconds);
        done();
    });
});

it("should set the Cache-Control: no-cache header for a request without a cache buster",
 function(done) {
    pendingOnAndroid();

    fetchFromLocalServer("/packages/meteor.js").then(function(response) {
        expect(response.headers.get("Cache-Control")).toContain("no-cache");
        done();
    });
});

*/

