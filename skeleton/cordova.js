/**
 * This is based on:
 * https://github.com/meteor/cordova-plugin-meteor-webapp/blob/master/www/webapp_local_server.js
 */


WebAppLocalServer = {
    onNewVersionReadyCallback: null,
    onErrorCallback: null,
    onVersionsCleanedUpCallback: null,
    startupDidComplete(callback) {
        this.onVersionsCleanedUpCallback = callback;
        console.log('startup did complete');
        Desktop.send('autoupdate', 'startupDidComplete');
    },

    checkForUpdates() {
        Desktop.send('autoupdate', 'checkForUpdates');
    },

    onNewVersionReady(callback) {
        this.onNewVersionReadyCallback = callback;
    },

    onError(callback) {
        this.onErrorCallback = callback;
    }
};

Desktop.on('autoupdate', 'error', (event, args) => {
    console.error(args);
    WebAppLocalServer.onErrorCallback();
});

Desktop.on('autoupdate', 'onVersionsCleanedUp', () => {
    if (WebAppLocalServer.onVersionsCleanedUpCallback) {
        WebAppLocalServer.onVersionsCleanedUpCallback();
    }
});

Desktop.on('autoupdate', 'onNewVersionReady', (event, args) => {
    console.log('new version ready', args);
    if (WebAppLocalServer.onNewVersionReadyCallback) {
        WebAppLocalServer.onNewVersionReadyCallback(args);
    }
});

// Set the reference, so that the desktop side will be able to communicate with us asap.
Desktop.send('dummyModule', 'setRendererReference');
