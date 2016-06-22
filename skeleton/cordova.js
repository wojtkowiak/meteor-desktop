/**
 * This is based on:
 * https://github.com/meteor/cordova-plugin-meteor-webapp/blob/master/www/webapp_local_server.js
 */


WebAppLocalServer = {
    _onNewVersionReady: null,
    _onError: null,
    _onVersionsCleanedUp: null,
    startupDidComplete(callback) {
        this._onVersionsCleanedUp = callback;
        console.log('startup did complete');
        Desktop.send('autoupdate', 'startupDidComplete');
    },

    checkForUpdates(callback) {
        Desktop.send('autoupdate', 'checkForUpdates');
    },

    onNewVersionReady(callback) {
        this._onNewVersionReady = callback;
    },

    onError(callback) {
        this._onError = callback;
    }
};

Desktop.on('autoupdate', 'error', function error(event, args) {
    console.error(args);
    WebAppLocalServer._onError();
});

Desktop.on('autoupdate', 'onVersionsCleanedUp', function onVersionsCleanedUp(event, args) {
    if (WebAppLocalServer._onVersionsCleanedUp) {
        WebAppLocalServer._onVersionsCleanedUp();
    }
});

Desktop.on('autoupdate', 'onNewVersionReady', function onNewVersionReady(event, args) {
    console.log('new version ready', args);
    if (WebAppLocalServer._onNewVersionReady) {
        WebAppLocalServer._onNewVersionReady(args);
    }
});

// Set the reference, so that the desktop side will be able to communicate with us asap.
Desktop.send('dummyModule', 'setRendererReference');
