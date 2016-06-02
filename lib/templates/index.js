var electron = require('electron');
const { app, BrowserWindow } = electron;

var path = require('path');
var join = path.join;
var fs = require('fs');
var shell = require('shelljs');
var Events = require('events').EventEmitter;
var systemEvents = new Events();

var winston = require('winston');
var l = new winston.Logger({
    level: 'debug',
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
        systemEvents.emit('unhandledException');
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
    var localServer;
    var webContents;

    var loadedAlready = false;
    var moduleName;

    l.info('ready fired');

    if (settings.window === undefined) {
        settings.window = {};
    }

    shell.ls(join(__dirname, 'modules', '*.js')).forEach(function loadModule(file) {
        if (!~file.indexOf('module.js')) {
            moduleName = path.parse(file).name;
            l.debug('loading module: ' + file);
            modules[moduleName] = require(file);
            modules[moduleName] = new modules[moduleName](l, app, settings, systemEvents);
        }
    });

    shell.ls('-d', join(__dirname, 'modules', '*')).forEach(function loadModuleFromDir(file) {
        if (fs.existsSync(path.join(file, 'index.js'))) {
            moduleName = path.parse(file).name;
            l.debug('loading module: ' + file, moduleName);
            modules[moduleName] = require(path.join(file, 'index.js'));
            modules[moduleName] = new modules[moduleName](l, app, settings, systemEvents);
        }
    });

    systemEvents.emit('beforeInitialization');

    systemEvents.emit('initialization');

    if (fs.existsSync('./desktop.js')) {
        require('./desktop.js')(l, app, settings, systemEvents, modules);
    }

    systemEvents.emit('mainLoaded');

    localServer = modules.localServer;

    localServer.setCallbacks(
        function onStartupFailed(code) {
            systemEvents.emit('startupFailed');
            require('electron')
                .dialog
                .showErrorBox('Startup error', 'Could not initialize app. Please contact your ' +
                    'support. Error code: ' + code);
            app.quit();
        },
        function onServerReady(port) {
            window = new BrowserWindow({
                width: 800, height: 600,
                webPreferences: {
                    nodeIntegration: false, // node integration must to be off
                    preload: join(__dirname, 'preload.js')
                },
                show: false
            });

            webContents = window.webContents;

            systemEvents.emit('windowOpened', window);

            // Here we are catching reloads triggered by hot code push.
            webContents.on('will-navigate', function onWillNavigate(event) {
                // We need to block it.
                event.preventDefault();
                systemEvents.emit('beforeReload', modules.autoupdate.getPendingVersion());

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
                if (!loadedAlready) {
                    loadedAlready = true;
                    systemEvents.emit('beforeLoadingFinished');

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
                }

                // TODO: consider firing device ready?
                // webContents.executeJavaScript('
                //     document.dispatchEvent(new Event("deviceready"));
                // ');
                systemEvents.emit('loadingFinished');
            });
            console.log('onServerReady');
            webContents.loadURL('http://127.0.0.1:' + port + '/');
        },
        function onServerRestarted(port) {
            console.log('onServerRestarted');
            webContents.loadURL('http://127.0.0.1:' + port + '/');
        }
    );

    localServer.init(modules.autoupdate.getDirectory(), modules.autoupdate.getParentDirectory());
});

app.on('window-all-closed', function onAllWindowClosed() {
    app.quit();
});
