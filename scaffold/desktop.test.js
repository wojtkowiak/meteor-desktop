import test from 'ava';
import electron from 'electron';
import path from 'path';
import { Application } from 'spectron';

/**
 * For this to work, init testing with `npm run desktop -- init-tests-support`.
 * This will add necessary packages to your `devDependencies` and add `desktop-test` to scripts.
 *
 * This is an example of functional test for your desktop app.
 * Remember that you need to rebuild your desktop app if you made changes in .desktop. You can
 * do that with `npm run desktop -- build`.
 * There is a plan for using desktop.asar built from omega:meteor-desktop-bundler so that you could
 * avoid manual rebuild.
 */

test.beforeEach(async t => {
    // Before each test we will spawn a new desktop app instance.
    t.context.app = new Application({
        path: electron,
        args: [path.join(__dirname, '..', '.meteor', 'desktop-build')],
        env: { ELECTRON_ENV: 'test', METEOR_DESKTOP_NO_SPLASH_SCREEN: 1 }
    });
    await t.context.app.start();
});

test.afterEach.always(async t => {
    // Kill the app after the test.
    if (t.context.app && t.context.app.isRunning()) {
        await t.context.app.stop();
    }
});

/**
 * Sends an IPC event to your module.
 *
 * @param {Object} app    - app ref from Spectron
 * @param {string} module - module name
 * @param {string} event  - event from your module
 * @param {...*}   args   - arguments to pass to ipc.send
 */
function sendModuleEvent(app, module, event, ...args) {
    args.unshift(`${module}__${event}`);
    return app.electron.ipcRenderer.send.apply(app.electron.ipcRenderer, args);
}

/**
 * Waits...
 * @param {number} ms - milliseconds to wait
 * @returns {Promise}
 */
function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), ms);
    });
}

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
                    if (result) {
                        clearTimeout(invokerTimeout);
                        clearTimeout(timeout);
                        resolve();
                    } else {
                        invokerTimeout = setTimeout(invokeFunction, 500);
                    }
                })
                .catch(e => {
                    invokerTimeout = setTimeout(invokeFunction, 500)
                });
        invokeFunction();
        timeout = setTimeout(() => {
            clearTimeout(invokerTimeout);
            reject('timeout expired on waitFor');
        }, ms)
    });
}

/**
 * Waits for the app to load and appear.
 * @param {Object} t - test context
 * @returns {{app: (Application|*), window: *}}
 */
async function waitForApp(t) {
    const app = t.context.app;
    await app.client.waitUntilWindowLoaded();
    const window = app.browserWindow;
    // Wait for the main window for max 30seconds. Adjust to your app.
    await waitFor(window.isVisible, 30000);
    t.is(await app.client.getWindowCount(), 2);
    return { app, window };
}

test.serial('if app can be closed', async t => {
    const { app, window } = await waitForApp(t);
    await sendModuleEvent(app, 'desktop', 'closeApp');
    t.true(await app.client.getWindowCount() === 0);

    // Spectron does not seem to notice app has quit so we need to do it manually.
    t.context.app.running = false;
});

// Empty test.
test.serial(async t => {
    const { app, window } = await waitForApp(t);

    // Your assertions...

    /*
     const title = await window.getTitle();
     t.is(title, 'my app <title>');

     // NOTE:
     // avoid using await in assertions like
     // t.is(await window.getTitle(), 'my app <title>');
     // it makes Power Assert not producing it's useful graphs
     */
});
