/**
 * This is based on:
 * https://github.com/meteor/cordova-plugin-meteor-webapp/blob/master/www/webapp_local_server.js
 */

WebAppLocalServer = {
    _onNewVersionReady: null,

    startupDidComplete: function startupDidComplete(callback) {
        // TODO: implement fallback startegy
        console.log('startupDidComplete() fired');
    },

    checkForUpdates: function checkForUpdates(callback) {
        Electron.send('autoupdateModule', 'checkForUpdates');
    },

    onNewVersionReady: function onNewVersionReady(callback) {
        this._onNewVersionReady = callback;
    },

    onError: function onError(callback) {
        console.log('onError called');
    }
};

Electron.on('autoupdateModule', 'error', function error(event, args) {
    console.log('received');
    console.error(args);
});

Electron.on('autoupdateModule', 'onNewVersionReady', function onNewVersionReady(event, args) {
    console.log('new version ready', args);
    if (WebAppLocalServer._onNewVersionReady) {
        WebAppLocalServer._onNewVersionReady(args);
    }
});

// Set the reference, so that the desktop side will be able to communicate with us asap.
Electron.send('dummyModule', 'setRendererReference');
