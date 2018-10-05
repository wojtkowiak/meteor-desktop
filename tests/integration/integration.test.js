/* eslint-disable no-console */
// eslint-disable-next-line no-unused-vars
import regeneratorRuntime from 'regenerator-runtime/runtime';
import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import fs from 'fs';
import path from 'path';
import shell from 'shelljs';
import { Application } from 'spectron';
import mockery from 'mockery';

import mockerySettings from '../helpers/mockerySettings';
import paths from '../helpers/paths';
import meteorDesktop from '../../lib/index';

shell.config.fatal = true;

chai.use(sinonChai);
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;

/**
 * This is first experimental integration test.
 */

let appDir = '';

/**
 * Waits until a promise from a function finally returns true.
 * @param {Function} functionReturningPromise - function to test
 * @param {number}   ms                       - expiration timeout in milliseconds
 * @returns {Promise}
 */
function waitFor(functionReturningPromise, ms = 10000) {
    return new Promise((resolve, reject) => {
        let invokerTimeout;
        let timeout;
        const invokeFunction = () =>
            functionReturningPromise()
                .then((result) => {
                    console.log(result);
                    if (result) {
                        clearTimeout(invokerTimeout);
                        clearTimeout(timeout);
                        resolve();
                    } else {
                        invokerTimeout = setTimeout(invokeFunction, 500);
                    }
                })
                .catch(() => {
                    invokerTimeout = setTimeout(invokeFunction, 500);
                });
        invokeFunction();
        timeout = setTimeout(() => {
            clearTimeout(invokerTimeout);
            reject('timeout expired on waitFor');
        }, ms);
    });
}

/**
 * Waits for the app to load and appear.
 * @param {Object} app - test app
 * @returns {{app: (Application|*), window: *}}
 */
async function waitForApp(app) {
    await app.client.waitUntilWindowLoaded();
    const window = app.browserWindow;
    // Wait for the main window for max 30seconds. Adjust to your app.
    await waitFor(window.isVisible, 30000);
    expect(await app.client.getWindowCount()).to.equal(1);
    await app.client.waitUntil(
        async () => app.client.execute(
            () => document.readyState === 'complete'
        )
    );
    return { app, window };
}

process.env.PLUGIN_VERSION = '1.7.0';

describe('desktop', () => {
    let MeteorDesktop;

    before(() => {
        appDir = path.join(paths.testsIntegrationTmpPath, 'test-desktop');
    });

    beforeEach(() => {
        try {
            fs.unlinkSync('meteor.log');
        } catch (e) {
            // No worries...
        }
    });

    describe('add to scripts', () => {
        let exitStub;

        before(() => {
            mockery.registerMock('path', {
                resolve: dir => dir,
                join: () => `${appDir}${path.sep}package.json`
            });
            mockery.enable(mockerySettings);
        });
        after(() => {
            mockery.deregisterMock('path');
            mockery.disable();
            exitStub.restore();
        });

        it('should add a `desktop` entry in package.json', () => {
            exitStub = sinon.stub(process, 'exit');
            require('../../lib/scripts/addToScripts'); // eslint-disable-line
            const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
            expect(exitStub).to.have.callCount(0);
            expect(packageJson.scripts.desktop).to.be.equal('meteor-desktop');
        });
    });

    describe('build involved tests', () => {
        let exitStub;
        let app;

        before(() => {
            process.env.MONGO_URL = 'none';
            // Load plugins directly from the package instead of those published to atmosphere.
            process.env.METEOR_PACKAGE_DIRS = path.resolve(path.join(__dirname, '..', '..', 'plugins'));
        });

        async function runIt() {
            // Run it.
            app = new Application({
                path: require(path.join(appDir, 'node_modules', 'electron')),
                args: [path.join(appDir, '.meteor', 'desktop-build')],
                requireName: 'electronRequire',
                startTimeout: 60000,
                env: {
                    NODE_ENV: 'test',
                    ELECTRON_ENV: 'test',
                    METEOR_DESKTOP_NO_SPLASH_SCREEN: 1
                },
                chromeDriverLogPath: path.join(__dirname, 'chrome.log')
            });
            try {
                await app.start();
                await waitForApp(app);
                const title = await app.client.getTitle();
                expect(title).to.equal('test-desktop');
                const text = await app.client.getText('h1');
                expect(text).to.equal('Welcome to Meteor!');
            } catch (e) {
                console.log(e);
                console.log(e.trace);
                console.log(fs.readFileSync(path.join(__dirname, 'chrome.log'), 'utf-8'));
            }
        }

        afterEach(async () => {
            exitStub.restore();
            if (app && app.isRunning()) {
                await app.stop();
            }
        });

        beforeEach(() => {
            exitStub = sinon.stub(process, 'exit').callsFake(() => {
                try {
                    console.log(fs.readFileSync('meteor.log', 'utf8'));
                } catch (e) {
                    // Nothing to do.
                }
                exitStub.restore();
                process.exit(1);
            });
        });

        it('expose electron modules', async () => {
            const platformsPath = path.join(appDir, '.meteor', 'platforms');
            let platforms = fs.readFileSync(platformsPath);
            if (!platforms.includes('android')) {
                platforms += '\nandroid\n';
                fs.writeFileSync(platformsPath, platforms);
            }

            if (!fs.existsSync(path.join(appDir, '.meteor', 'local', 'cordova-build', 'www', 'application'))) {
                try {
                    shell.exec('meteor build ../build --server=127.0.0.1:3080 --verbose', { cwd: appDir });
                } catch (e) {
                    //
                }
            }

            MeteorDesktop = meteorDesktop(
                appDir,
                appDir,
                {
                    ddpUrl: 'http://127.0.0.1:3080',
                    build: true,
                    output: appDir,
                    skipMobileBuild: true,
                    forceCordovaBuild: true
                }
            );

            await MeteorDesktop.init();

            const settingsJsonPath = path.join(appDir, '.desktop', 'settings.json');
            const settingJson = JSON.parse(fs.readFileSync(settingsJsonPath));
            settingJson.exposedModules = ['webFrame'];
            fs.writeFileSync(settingsJsonPath, JSON.stringify(settingJson, null, 2));

            await MeteorDesktop.build();
            await runIt();

            // Test the exposedModules functionality.
            const result = await app.client.execute(
                () => Desktop.electron.webFrame.getZoomFactor()
            );
            expect(result.value).to.equal(1);
        }).timeout(10 * 60000);

        it('should build installer', async () => {
            MeteorDesktop = meteorDesktop(
                appDir,
                appDir,
                {
                    ddpUrl: 'http://127.0.0.1:3080',
                    build: true,
                    output: appDir,
                    scaffold: true,
                    skipMobileBuild: true,
                    forceCordovaBuild: true,
                    skipRemoveMobilePlatform: true
                }
            );

            if (fs.existsSync(path.join(appDir, MeteorDesktop.env.paths.installerDir))) {
                shell.rm('-rf', MeteorDesktop.env.paths.installerDir);
            }

            // Build the installer.
            try {
                await MeteorDesktop.buildInstaller(true);
            } catch (e) {
                throw new Error(e);
            }
            // For now we are just making an assumption that it went ok
            // if it did not throw an error.

            expect(fs.existsSync(
                path.join(appDir, MeteorDesktop.env.paths.installerDir)
            )).to.be.true();
        }).timeout(10 * 60000);

        if (process.env.TRAVIS || process.env.APPVEYOR) {
            it('should build with -b', async () => {
                MeteorDesktop = meteorDesktop(
                    appDir,
                    appDir,
                    {
                        ddpUrl: 'http://127.0.0.1:3080',
                        build: true,
                        output: appDir,
                        scaffold: true,
                        skipMobileBuild: !!process.env.TRAVIS,
                        forceCordovaBuild: !!process.env.TRAVIS,
                        skipRemoveMobilePlatform: true
                    }
                );

                // Build the app.
                await MeteorDesktop.build();

                await runIt();
            }).timeout(10 * 60000);
        }
    });
});
