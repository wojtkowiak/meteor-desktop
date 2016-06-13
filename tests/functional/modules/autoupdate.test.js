// These test were ported and adapted from here
// https://github.com/meteor/cordova-plugin-meteor-webapp/blob/master/tests/www/tests.js

import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
chai.use(sinonChai);
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;
import paths from '../../helpers/paths';
import LocalServer from '../../helpers/meteorServer';
import HCPClient from '../../../modules/autoupdate.js';
import fetch from 'node-fetch';
import path from 'path';
import shell from 'shelljs';


let localPort;
// const oneYearInSeconds = 60 * 60 * 24 * 365;

function serveVersion(version) {
    return new Promise((resolve, reject) => {
        const localServer = new LocalServer({
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
        localServer.init(path.join(paths.fixtures.downloadableVersions, version));
    });
}


describe('localServer', () => {
    let localServer;

    describe("when updating from the bundled app version to a downloaded version", function() {
        beforeEach(async () => {
            localServer = await serveVersion('version2');
            shell.rm(path.join(paths.fixtures.autoUpdate, 'autoupdate.json'));
            shell.rm('-rf', path.join(paths.fixtures.autoUpdate, 'versions'));
        });

        afterEach(() => {
            localServer.httpServerInstance.destroy();
            //WebAppLocalServer.resetToInitialState(done);
        });

        it("should only serve the new version after a page reload", function (done) {
            const logger = {
                info(msg) { console.log(msg);},
                debug(msg) { console.log(msg); },
                warn() {},
                error(...args) { console.error(...args); },
                clone() { return this; }
            };

            const autoupdate = new HCPClient(
                logger,
                {},
                {},
                { on() {}, emit(event) {
                 console.log(event); done();
                } },
                { },
                {
                    dataPath: paths.fixtures.autoUpdate,
                    bundleStorePath: paths.fixtures.autoUpdate,
                    initialBundlePath: path.join(paths.fixtures.bundledWww)
                },
                class Module { on() {}
                    send() {} }
            );

            autoupdate._init();

            /*WebAppLocalServer.onNewVersionReady(function() {
             expectVersionServedToEqual("version1", function() {
             WebAppLocalServer.simulatePageReload(function() {
             expectVersionServedToEqual("version2", done);
             });
             });
             });
*/
            autoupdate.checkForUpdates();

        });
    });
});
