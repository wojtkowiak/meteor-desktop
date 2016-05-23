var app = require('app');
var Browser = require('browser-window');
var path = require('path');
var join = path.join;
var fs = require('fs');
var shell = require('shelljs');

var winston = require('winston');
var l = new winston.Logger({
    level: 'info',
    transports: [
        new (winston.transports.Console)(),
        new (winston.transports.File)({ filename: join(__dirname, 'run.log') })
    ]
});

var window = null;
var splashScreen = null;
var settings = {
    devTools: false
};
var modules = {};

process.on('uncaughtException', function uncaughtException(error) {
    l.error(error);
    try {
        splashScreen.close();
    } catch (e) {
        // Empty catch block... nasty...
    }
    try {
        window.close();
    } catch (e) {
        // Empty catch block... nasty...
    }
    app.quit();
});

if (fs.existsSync(join(__dirname, 'settings.json'))) {
    settings = require(join(__dirname, 'settings.json'));
}

require('electron-debug')({
    showDevTools: true,
    enabled: (settings.devTools !== undefined) ? settings.devTools : true
});


app.on('ready', function onReady() {
    var SplashScreen = null;
    var LocalServer = null;
    var localServer;
    var webContents;

    l.info('ready fired');

    if (settings.window === undefined) {
        settings.window = {};
    }

    shell.ls(join(__dirname, 'modules', '*.js')).forEach(function loadModule(file) {
        if (!~file.indexOf('module.js')) {
            modules[path.parse(file).name] = require(file);
        }
    });

    SplashScreen = modules.splashScreen;
    LocalServer = modules.localServer;

    splashScreen = new SplashScreen(settings, fs, l, path, Browser);
    splashScreen.show();

    localServer = new LocalServer(l, app);

    localServer.setCallbacks(
        function onStartupFailed(code) {
            splashScreen.close();
            require('electron')
                .dialog
                .showErrorBox('Startup error', 'Could not initialize app. Please contact your ' +
                    'support. Error code: ' + code);
            app.quit();
        },
        function onServerReady(port) {
            window = new Browser({
                width: 800, height: 600,
                webPreferences: {
                    nodeIntegration: false, // node integration must to be off
                    preload: join(__dirname, 'preload.js')
                },
                show: false
            });

            webContents = window.webContents;

            // Here we are catching reloads triggered by hot code push.
            webContents.on('will-navigate', function onWillNavigate(event) {
                // We need to block it.
                event.preventDefault();

                // Firing reset routine.
                modules.autoupdate.onReset();

                // Reinitialize the local server.
                localServer.init(
                    modules.autoupdate.getDirectory(),
                    modules.autoupdate.getParentDirectory(),
                    true
                );
            });

            // The app was loaded.
            webContents.on('did-stop-loading', function onDidStopLoading() {
                splashScreen.close();
                if (settings.window.fullscreen) {
                    window.setFullScreen(true);
                }
                window.setKiosk(
                    settings.window.kiosk !== undefined ? settings.window.kiosk : false
                );
                window.setAlwaysOnTop(
                    settings.window.alwaysOnTop !== undefined ? settings.window.alwaysOnTop : false
                );
                window.show();

                // TODO: consider firing device ready?
                // webContents.executeJavaScript('
                //     document.dispatchEvent(new Event("deviceready"));
                // ');
            });
            webContents.loadURL('http://127.0.0.1:' + port + '/');
        },
        function onServerRestarted(port) {
            webContents.loadURL('http://127.0.0.1:' + port + '/');
        }
    );

    localServer.init(modules.autoupdate.getDirectory(), modules.autoupdate.getParentDirectory());
});

app.on('window-all-closed', function onAllWindowClosed() {
    app.quit();
});
