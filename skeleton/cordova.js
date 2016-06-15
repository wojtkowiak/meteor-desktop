/**
 * This is based on:
 * https://github.com/meteor/cordova-plugin-meteor-webapp/blob/master/www/webapp_local_server.js
 */


WebAppLocalServer = {
    _onNewVersionReady: null,
    _onError: null,
    startupDidComplete(callback) {
        // TODO: implement fallback startegy
        console.log('startupDidComplete() fired');
    },

    checkForUpdates(callback) {
        Desktop.send('autoupdateModule', 'checkForUpdates');
    },

    onNewVersionReady(callback) {
        this._onNewVersionReady = callback;
    },

    onError(callback) {
        this._onError = callback;
        console.log('onError called');
    }
};

Desktop.on('autoupdateModule', 'error', function error(event, args) {
    console.log('received');
    console.error(args);
    WebAppLocalServer._onError();
});

Desktop.on('autoupdateModule', 'onNewVersionReady', function onNewVersionReady(event, args) {
    console.log('new version ready', args);
    if (WebAppLocalServer._onNewVersionReady) {
        WebAppLocalServer._onNewVersionReady(args);
    }
});

// Set the reference, so that the desktop side will be able to communicate with us asap.
Desktop.send('dummyModule', 'setRendererReference');
