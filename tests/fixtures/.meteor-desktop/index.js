var electron = require('electron');
var app = electron.app;
var BrowserWindow = electron.BrowserWindow;


var path = require('path');
var join = path.join;
var fs = require('fs');
var shell = require('shelljs');
var Events = require('events').EventEmitter;
var systemEvents = new Events();

var winston = require('winston');
var l = new winston.Logger({
    level: 'debug',
    transports: [new winston.transports.Console(), new winston.transports.File({ filename: join(__dirname, 'run.log') })]
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
    enabled: settings.devTools !== undefined ? settings.devTools : true
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
        if (! ~file.indexOf('module.js')) {
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

    localServer.setCallbacks(function onStartupFailed(code) {
        systemEvents.emit('startupFailed');
        require('electron').dialog.showErrorBox('Startup error', 'Could not initialize app. Please contact your ' + 'support. Error code: ' + code);
        app.quit();
    }, function onServerReady(port) {
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
            localServer.init(modules.autoupdate.getDirectory(), modules.autoupdate.getParentDirectory(), true);
        });

        // The app was loaded.
        webContents.on('did-stop-loading', function onDidStopLoading() {
            if (!loadedAlready) {
                loadedAlready = true;
                systemEvents.emit('beforeLoadingFinished');

                if (settings.window.fullscreen) {
                    window.setFullScreen(true);
                }
                window.setKiosk(settings.window.kiosk !== undefined ? settings.window.kiosk : false);
                window.setAlwaysOnTop(settings.window.alwaysOnTop !== undefined ? settings.window.alwaysOnTop : false);
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
    }, function onServerRestarted(port) {
        console.log('onServerRestarted');
        webContents.loadURL('http://127.0.0.1:' + port + '/');
    });

    localServer.init(modules.autoupdate.getDirectory(), modules.autoupdate.getParentDirectory());
});

app.on('window-all-closed', function onAllWindowClosed() {
    app.quit();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlbXBsYXRlcy9pbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxJQUFJLFdBQVcsUUFBUSxVQUFSLENBQWY7SUFDUSxHLEdBQXVCLFEsQ0FBdkIsRztJQUFLLGEsR0FBa0IsUSxDQUFsQixhOzs7QUFFYixJQUFJLE9BQU8sUUFBUSxNQUFSLENBQVg7QUFDQSxJQUFJLE9BQU8sS0FBSyxJQUFoQjtBQUNBLElBQUksS0FBSyxRQUFRLElBQVIsQ0FBVDtBQUNBLElBQUksUUFBUSxRQUFRLFNBQVIsQ0FBWjtBQUNBLElBQUksU0FBUyxRQUFRLFFBQVIsRUFBa0IsWUFBL0I7QUFDQSxJQUFJLGVBQWUsSUFBSSxNQUFKLEVBQW5COztBQUVBLElBQUksVUFBVSxRQUFRLFNBQVIsQ0FBZDtBQUNBLElBQUksSUFBSSxJQUFJLFFBQVEsTUFBWixDQUFtQjtBQUN2QixXQUFPLE9BRGdCO0FBRXZCLGdCQUFZLENBQ1IsSUFBSyxRQUFRLFVBQVIsQ0FBbUIsT0FBeEIsRUFEUSxFQUVSLElBQUssUUFBUSxVQUFSLENBQW1CLElBQXhCLENBQThCLEVBQUUsVUFBVSxLQUFLLFNBQUwsRUFBZ0IsU0FBaEIsQ0FBWixFQUE5QixDQUZRO0FBRlcsQ0FBbkIsQ0FBUjs7QUFRQSxJQUFJLFNBQVMsSUFBYjtBQUNBLElBQUksZUFBZSxJQUFuQjtBQUNBLElBQUksV0FBVztBQUNYLGNBQVU7QUFEQyxDQUFmO0FBR0EsSUFBSSxVQUFVLEVBQWQ7O0FBRUEsUUFBUSxFQUFSLENBQVcsbUJBQVgsRUFBZ0MsU0FBUyxpQkFBVCxDQUEyQixLQUEzQixFQUFrQztBQUM5RCxNQUFFLEtBQUYsQ0FBUSxLQUFSO0FBQ0EsUUFBSTtBQUNBLHFCQUFhLElBQWIsQ0FBa0Isb0JBQWxCO0FBQ0gsS0FGRCxDQUVFLE9BQU8sQ0FBUCxFQUFVOztBQUVYO0FBQ0QsUUFBSTtBQUNBLGVBQU8sS0FBUDtBQUNILEtBRkQsQ0FFRSxPQUFPLENBQVAsRUFBVTs7QUFFWDtBQUNELFFBQUksSUFBSjtBQUNILENBYkQ7O0FBZUEsSUFBSSxHQUFHLFVBQUgsQ0FBYyxLQUFLLFNBQUwsRUFBZ0IsZUFBaEIsQ0FBZCxDQUFKLEVBQXFEO0FBQ2pELGVBQVcsUUFBUSxLQUFLLFNBQUwsRUFBZ0IsZUFBaEIsQ0FBUixDQUFYO0FBQ0g7O0FBRUQsUUFBUSxnQkFBUixFQUEwQjtBQUN0QixrQkFBYyxJQURRO0FBRXRCLGFBQVUsU0FBUyxRQUFULEtBQXNCLFNBQXZCLEdBQW9DLFNBQVMsUUFBN0MsR0FBd0Q7QUFGM0MsQ0FBMUI7O0FBTUEsSUFBSSxFQUFKLENBQU8sT0FBUCxFQUFnQixTQUFTLE9BQVQsR0FBbUI7QUFDL0IsUUFBSSxXQUFKO0FBQ0EsUUFBSSxXQUFKOztBQUVBLFFBQUksZ0JBQWdCLEtBQXBCO0FBQ0EsUUFBSSxVQUFKOztBQUVBLE1BQUUsSUFBRixDQUFPLGFBQVA7O0FBRUEsUUFBSSxTQUFTLE1BQVQsS0FBb0IsU0FBeEIsRUFBbUM7QUFDL0IsaUJBQVMsTUFBVCxHQUFrQixFQUFsQjtBQUNIOztBQUVELFVBQU0sRUFBTixDQUFTLEtBQUssU0FBTCxFQUFnQixTQUFoQixFQUEyQixNQUEzQixDQUFULEVBQTZDLE9BQTdDLENBQXFELFNBQVMsVUFBVCxDQUFvQixJQUFwQixFQUEwQjtBQUMzRSxZQUFJLEVBQUMsQ0FBQyxLQUFLLE9BQUwsQ0FBYSxXQUFiLENBQU4sRUFBaUM7QUFDN0IseUJBQWEsS0FBSyxLQUFMLENBQVcsSUFBWCxFQUFpQixJQUE5QjtBQUNBLGNBQUUsS0FBRixDQUFRLHFCQUFxQixJQUE3QjtBQUNBLG9CQUFRLFVBQVIsSUFBc0IsUUFBUSxJQUFSLENBQXRCO0FBQ0Esb0JBQVEsVUFBUixJQUFzQixJQUFJLFFBQVEsVUFBUixDQUFKLENBQXdCLENBQXhCLEVBQTJCLEdBQTNCLEVBQWdDLFFBQWhDLEVBQTBDLFlBQTFDLENBQXRCO0FBQ0g7QUFDSixLQVBEOztBQVNBLFVBQU0sRUFBTixDQUFTLElBQVQsRUFBZSxLQUFLLFNBQUwsRUFBZ0IsU0FBaEIsRUFBMkIsR0FBM0IsQ0FBZixFQUFnRCxPQUFoRCxDQUF3RCxTQUFTLGlCQUFULENBQTJCLElBQTNCLEVBQWlDO0FBQ3JGLFlBQUksR0FBRyxVQUFILENBQWMsS0FBSyxJQUFMLENBQVUsSUFBVixFQUFnQixVQUFoQixDQUFkLENBQUosRUFBZ0Q7QUFDNUMseUJBQWEsS0FBSyxLQUFMLENBQVcsSUFBWCxFQUFpQixJQUE5QjtBQUNBLGNBQUUsS0FBRixDQUFRLHFCQUFxQixJQUE3QixFQUFtQyxVQUFuQztBQUNBLG9CQUFRLFVBQVIsSUFBc0IsUUFBUSxLQUFLLElBQUwsQ0FBVSxJQUFWLEVBQWdCLFVBQWhCLENBQVIsQ0FBdEI7QUFDQSxvQkFBUSxVQUFSLElBQXNCLElBQUksUUFBUSxVQUFSLENBQUosQ0FBd0IsQ0FBeEIsRUFBMkIsR0FBM0IsRUFBZ0MsUUFBaEMsRUFBMEMsWUFBMUMsQ0FBdEI7QUFDSDtBQUNKLEtBUEQ7O0FBU0EsaUJBQWEsSUFBYixDQUFrQixzQkFBbEI7O0FBRUEsaUJBQWEsSUFBYixDQUFrQixnQkFBbEI7O0FBRUEsUUFBSSxHQUFHLFVBQUgsQ0FBYyxjQUFkLENBQUosRUFBbUM7QUFDL0IsZ0JBQVEsY0FBUixFQUF3QixDQUF4QixFQUEyQixHQUEzQixFQUFnQyxRQUFoQyxFQUEwQyxZQUExQyxFQUF3RCxPQUF4RDtBQUNIOztBQUVELGlCQUFhLElBQWIsQ0FBa0IsWUFBbEI7O0FBRUEsa0JBQWMsUUFBUSxXQUF0Qjs7QUFFQSxnQkFBWSxZQUFaLENBQ0ksU0FBUyxlQUFULENBQXlCLElBQXpCLEVBQStCO0FBQzNCLHFCQUFhLElBQWIsQ0FBa0IsZUFBbEI7QUFDQSxnQkFBUSxVQUFSLEVBQ0ssTUFETCxDQUVLLFlBRkwsQ0FFa0IsZUFGbEIsRUFFbUMsbURBQzNCLHVCQUQyQixHQUNELElBSGxDO0FBSUEsWUFBSSxJQUFKO0FBQ0gsS0FSTCxFQVNJLFNBQVMsYUFBVCxDQUF1QixJQUF2QixFQUE2QjtBQUN6QixpQkFBUyxJQUFJLGFBQUosQ0FBa0I7QUFDdkIsbUJBQU8sR0FEZ0IsRUFDWCxRQUFRLEdBREc7QUFFdkIsNEJBQWdCO0FBQ1osaUNBQWlCLEtBREwsRTtBQUVaLHlCQUFTLEtBQUssU0FBTCxFQUFnQixZQUFoQjtBQUZHLGFBRk87QUFNdkIsa0JBQU07QUFOaUIsU0FBbEIsQ0FBVDs7QUFTQSxzQkFBYyxPQUFPLFdBQXJCOztBQUVBLHFCQUFhLElBQWIsQ0FBa0IsY0FBbEIsRUFBa0MsTUFBbEM7OztBQUdBLG9CQUFZLEVBQVosQ0FBZSxlQUFmLEVBQWdDLFNBQVMsY0FBVCxDQUF3QixLQUF4QixFQUErQjs7QUFFM0Qsa0JBQU0sY0FBTjtBQUNBLHlCQUFhLElBQWIsQ0FBa0IsY0FBbEIsRUFBa0MsUUFBUSxVQUFSLENBQW1CLGlCQUFuQixFQUFsQzs7O0FBR0Esb0JBQVEsVUFBUixDQUFtQixPQUFuQjs7O0FBR0Esd0JBQVksSUFBWixDQUNJLFFBQVEsVUFBUixDQUFtQixZQUFuQixFQURKLEVBRUksUUFBUSxVQUFSLENBQW1CLGtCQUFuQixFQUZKLEVBR0ksSUFISjtBQUtILFNBZEQ7OztBQWlCQSxvQkFBWSxFQUFaLENBQWUsa0JBQWYsRUFBbUMsU0FBUyxnQkFBVCxHQUE0QjtBQUMzRCxnQkFBSSxDQUFDLGFBQUwsRUFBb0I7QUFDaEIsZ0NBQWdCLElBQWhCO0FBQ0EsNkJBQWEsSUFBYixDQUFrQix1QkFBbEI7O0FBRUEsb0JBQUksU0FBUyxNQUFULENBQWdCLFVBQXBCLEVBQWdDO0FBQzVCLDJCQUFPLGFBQVAsQ0FBcUIsSUFBckI7QUFDSDtBQUNELHVCQUFPLFFBQVAsQ0FDSSxTQUFTLE1BQVQsQ0FBZ0IsS0FBaEIsS0FBMEIsU0FBMUIsR0FBc0MsU0FBUyxNQUFULENBQWdCLEtBQXRELEdBQThELEtBRGxFO0FBR0EsdUJBQU8sY0FBUCxDQUNJLFNBQVMsTUFBVCxDQUFnQixXQUFoQixLQUFnQyxTQUFoQyxHQUE0QyxTQUFTLE1BQVQsQ0FBZ0IsV0FBNUQsR0FBMEUsS0FEOUU7QUFHQSx1QkFBTyxJQUFQO0FBQ0g7Ozs7OztBQU1ELHlCQUFhLElBQWIsQ0FBa0IsaUJBQWxCO0FBQ0gsU0F0QkQ7QUF1QkEsZ0JBQVEsR0FBUixDQUFZLGVBQVo7QUFDQSxvQkFBWSxPQUFaLENBQW9CLHNCQUFzQixJQUF0QixHQUE2QixHQUFqRDtBQUNILEtBbEVMLEVBbUVJLFNBQVMsaUJBQVQsQ0FBMkIsSUFBM0IsRUFBaUM7QUFDN0IsZ0JBQVEsR0FBUixDQUFZLG1CQUFaO0FBQ0Esb0JBQVksT0FBWixDQUFvQixzQkFBc0IsSUFBdEIsR0FBNkIsR0FBakQ7QUFDSCxLQXRFTDs7QUF5RUEsZ0JBQVksSUFBWixDQUFpQixRQUFRLFVBQVIsQ0FBbUIsWUFBbkIsRUFBakIsRUFBb0QsUUFBUSxVQUFSLENBQW1CLGtCQUFuQixFQUFwRDtBQUNILENBckhEOztBQXVIQSxJQUFJLEVBQUosQ0FBTyxtQkFBUCxFQUE0QixTQUFTLGlCQUFULEdBQTZCO0FBQ3JELFFBQUksSUFBSjtBQUNILENBRkQiLCJmaWxlIjoidGVtcGxhdGVzL2luZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsidmFyIGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbmNvbnN0IHsgYXBwLCBCcm93c2VyV2luZG93IH0gPSBlbGVjdHJvbjtcblxudmFyIHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG52YXIgam9pbiA9IHBhdGguam9pbjtcbnZhciBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG52YXIgc2hlbGwgPSByZXF1aXJlKCdzaGVsbGpzJyk7XG52YXIgRXZlbnRzID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIHN5c3RlbUV2ZW50cyA9IG5ldyBFdmVudHMoKTtcblxudmFyIHdpbnN0b24gPSByZXF1aXJlKCd3aW5zdG9uJyk7XG52YXIgbCA9IG5ldyB3aW5zdG9uLkxvZ2dlcih7XG4gICAgbGV2ZWw6ICdkZWJ1ZycsXG4gICAgdHJhbnNwb3J0czogW1xuICAgICAgICBuZXcgKHdpbnN0b24udHJhbnNwb3J0cy5Db25zb2xlKSgpLFxuICAgICAgICBuZXcgKHdpbnN0b24udHJhbnNwb3J0cy5GaWxlKSh7IGZpbGVuYW1lOiBqb2luKF9fZGlybmFtZSwgJ3J1bi5sb2cnKSB9KVxuICAgIF1cbn0pO1xuXG52YXIgd2luZG93ID0gbnVsbDtcbnZhciBzcGxhc2hTY3JlZW4gPSBudWxsO1xudmFyIHNldHRpbmdzID0ge1xuICAgIGRldlRvb2xzOiBmYWxzZVxufTtcbnZhciBtb2R1bGVzID0ge307XG5cbnByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZnVuY3Rpb24gdW5jYXVnaHRFeGNlcHRpb24oZXJyb3IpIHtcbiAgICBsLmVycm9yKGVycm9yKTtcbiAgICB0cnkge1xuICAgICAgICBzeXN0ZW1FdmVudHMuZW1pdCgndW5oYW5kbGVkRXhjZXB0aW9uJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvLyBFbXB0eSBjYXRjaCBibG9jay4uLiBuYXN0eS4uLlxuICAgIH1cbiAgICB0cnkge1xuICAgICAgICB3aW5kb3cuY2xvc2UoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIEVtcHR5IGNhdGNoIGJsb2NrLi4uIG5hc3R5Li4uXG4gICAgfVxuICAgIGFwcC5xdWl0KCk7XG59KTtcblxuaWYgKGZzLmV4aXN0c1N5bmMoam9pbihfX2Rpcm5hbWUsICdzZXR0aW5ncy5qc29uJykpKSB7XG4gICAgc2V0dGluZ3MgPSByZXF1aXJlKGpvaW4oX19kaXJuYW1lLCAnc2V0dGluZ3MuanNvbicpKTtcbn1cblxucmVxdWlyZSgnZWxlY3Ryb24tZGVidWcnKSh7XG4gICAgc2hvd0RldlRvb2xzOiB0cnVlLFxuICAgIGVuYWJsZWQ6IChzZXR0aW5ncy5kZXZUb29scyAhPT0gdW5kZWZpbmVkKSA/IHNldHRpbmdzLmRldlRvb2xzIDogdHJ1ZVxufSk7XG5cblxuYXBwLm9uKCdyZWFkeScsIGZ1bmN0aW9uIG9uUmVhZHkoKSB7XG4gICAgdmFyIGxvY2FsU2VydmVyO1xuICAgIHZhciB3ZWJDb250ZW50cztcblxuICAgIHZhciBsb2FkZWRBbHJlYWR5ID0gZmFsc2U7XG4gICAgdmFyIG1vZHVsZU5hbWU7XG5cbiAgICBsLmluZm8oJ3JlYWR5IGZpcmVkJyk7XG5cbiAgICBpZiAoc2V0dGluZ3Mud2luZG93ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc2V0dGluZ3Mud2luZG93ID0ge307XG4gICAgfVxuXG4gICAgc2hlbGwubHMoam9pbihfX2Rpcm5hbWUsICdtb2R1bGVzJywgJyouanMnKSkuZm9yRWFjaChmdW5jdGlvbiBsb2FkTW9kdWxlKGZpbGUpIHtcbiAgICAgICAgaWYgKCF+ZmlsZS5pbmRleE9mKCdtb2R1bGUuanMnKSkge1xuICAgICAgICAgICAgbW9kdWxlTmFtZSA9IHBhdGgucGFyc2UoZmlsZSkubmFtZTtcbiAgICAgICAgICAgIGwuZGVidWcoJ2xvYWRpbmcgbW9kdWxlOiAnICsgZmlsZSk7XG4gICAgICAgICAgICBtb2R1bGVzW21vZHVsZU5hbWVdID0gcmVxdWlyZShmaWxlKTtcbiAgICAgICAgICAgIG1vZHVsZXNbbW9kdWxlTmFtZV0gPSBuZXcgbW9kdWxlc1ttb2R1bGVOYW1lXShsLCBhcHAsIHNldHRpbmdzLCBzeXN0ZW1FdmVudHMpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBzaGVsbC5scygnLWQnLCBqb2luKF9fZGlybmFtZSwgJ21vZHVsZXMnLCAnKicpKS5mb3JFYWNoKGZ1bmN0aW9uIGxvYWRNb2R1bGVGcm9tRGlyKGZpbGUpIHtcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMocGF0aC5qb2luKGZpbGUsICdpbmRleC5qcycpKSkge1xuICAgICAgICAgICAgbW9kdWxlTmFtZSA9IHBhdGgucGFyc2UoZmlsZSkubmFtZTtcbiAgICAgICAgICAgIGwuZGVidWcoJ2xvYWRpbmcgbW9kdWxlOiAnICsgZmlsZSwgbW9kdWxlTmFtZSk7XG4gICAgICAgICAgICBtb2R1bGVzW21vZHVsZU5hbWVdID0gcmVxdWlyZShwYXRoLmpvaW4oZmlsZSwgJ2luZGV4LmpzJykpO1xuICAgICAgICAgICAgbW9kdWxlc1ttb2R1bGVOYW1lXSA9IG5ldyBtb2R1bGVzW21vZHVsZU5hbWVdKGwsIGFwcCwgc2V0dGluZ3MsIHN5c3RlbUV2ZW50cyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHN5c3RlbUV2ZW50cy5lbWl0KCdiZWZvcmVJbml0aWFsaXphdGlvbicpO1xuXG4gICAgc3lzdGVtRXZlbnRzLmVtaXQoJ2luaXRpYWxpemF0aW9uJyk7XG5cbiAgICBpZiAoZnMuZXhpc3RzU3luYygnLi9kZXNrdG9wLmpzJykpIHtcbiAgICAgICAgcmVxdWlyZSgnLi9kZXNrdG9wLmpzJykobCwgYXBwLCBzZXR0aW5ncywgc3lzdGVtRXZlbnRzLCBtb2R1bGVzKTtcbiAgICB9XG5cbiAgICBzeXN0ZW1FdmVudHMuZW1pdCgnbWFpbkxvYWRlZCcpO1xuXG4gICAgbG9jYWxTZXJ2ZXIgPSBtb2R1bGVzLmxvY2FsU2VydmVyO1xuXG4gICAgbG9jYWxTZXJ2ZXIuc2V0Q2FsbGJhY2tzKFxuICAgICAgICBmdW5jdGlvbiBvblN0YXJ0dXBGYWlsZWQoY29kZSkge1xuICAgICAgICAgICAgc3lzdGVtRXZlbnRzLmVtaXQoJ3N0YXJ0dXBGYWlsZWQnKTtcbiAgICAgICAgICAgIHJlcXVpcmUoJ2VsZWN0cm9uJylcbiAgICAgICAgICAgICAgICAuZGlhbG9nXG4gICAgICAgICAgICAgICAgLnNob3dFcnJvckJveCgnU3RhcnR1cCBlcnJvcicsICdDb3VsZCBub3QgaW5pdGlhbGl6ZSBhcHAuIFBsZWFzZSBjb250YWN0IHlvdXIgJyArXG4gICAgICAgICAgICAgICAgICAgICdzdXBwb3J0LiBFcnJvciBjb2RlOiAnICsgY29kZSk7XG4gICAgICAgICAgICBhcHAucXVpdCgpO1xuICAgICAgICB9LFxuICAgICAgICBmdW5jdGlvbiBvblNlcnZlclJlYWR5KHBvcnQpIHtcbiAgICAgICAgICAgIHdpbmRvdyA9IG5ldyBCcm93c2VyV2luZG93KHtcbiAgICAgICAgICAgICAgICB3aWR0aDogODAwLCBoZWlnaHQ6IDYwMCxcbiAgICAgICAgICAgICAgICB3ZWJQcmVmZXJlbmNlczoge1xuICAgICAgICAgICAgICAgICAgICBub2RlSW50ZWdyYXRpb246IGZhbHNlLCAvLyBub2RlIGludGVncmF0aW9uIG11c3QgdG8gYmUgb2ZmXG4gICAgICAgICAgICAgICAgICAgIHByZWxvYWQ6IGpvaW4oX19kaXJuYW1lLCAncHJlbG9hZC5qcycpXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzaG93OiBmYWxzZVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHdlYkNvbnRlbnRzID0gd2luZG93LndlYkNvbnRlbnRzO1xuXG4gICAgICAgICAgICBzeXN0ZW1FdmVudHMuZW1pdCgnd2luZG93T3BlbmVkJywgd2luZG93KTtcblxuICAgICAgICAgICAgLy8gSGVyZSB3ZSBhcmUgY2F0Y2hpbmcgcmVsb2FkcyB0cmlnZ2VyZWQgYnkgaG90IGNvZGUgcHVzaC5cbiAgICAgICAgICAgIHdlYkNvbnRlbnRzLm9uKCd3aWxsLW5hdmlnYXRlJywgZnVuY3Rpb24gb25XaWxsTmF2aWdhdGUoZXZlbnQpIHtcbiAgICAgICAgICAgICAgICAvLyBXZSBuZWVkIHRvIGJsb2NrIGl0LlxuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgc3lzdGVtRXZlbnRzLmVtaXQoJ2JlZm9yZVJlbG9hZCcsIG1vZHVsZXMuYXV0b3VwZGF0ZS5nZXRQZW5kaW5nVmVyc2lvbigpKTtcblxuICAgICAgICAgICAgICAgIC8vIEZpcmluZyByZXNldCByb3V0aW5lLlxuICAgICAgICAgICAgICAgIG1vZHVsZXMuYXV0b3VwZGF0ZS5vblJlc2V0KCk7XG5cbiAgICAgICAgICAgICAgICAvLyBSZWluaXRpYWxpemUgdGhlIGxvY2FsIHNlcnZlci5cbiAgICAgICAgICAgICAgICBsb2NhbFNlcnZlci5pbml0KFxuICAgICAgICAgICAgICAgICAgICBtb2R1bGVzLmF1dG91cGRhdGUuZ2V0RGlyZWN0b3J5KCksXG4gICAgICAgICAgICAgICAgICAgIG1vZHVsZXMuYXV0b3VwZGF0ZS5nZXRQYXJlbnREaXJlY3RvcnkoKSxcbiAgICAgICAgICAgICAgICAgICAgdHJ1ZVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gVGhlIGFwcCB3YXMgbG9hZGVkLlxuICAgICAgICAgICAgd2ViQ29udGVudHMub24oJ2RpZC1zdG9wLWxvYWRpbmcnLCBmdW5jdGlvbiBvbkRpZFN0b3BMb2FkaW5nKCkge1xuICAgICAgICAgICAgICAgIGlmICghbG9hZGVkQWxyZWFkeSkge1xuICAgICAgICAgICAgICAgICAgICBsb2FkZWRBbHJlYWR5ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgc3lzdGVtRXZlbnRzLmVtaXQoJ2JlZm9yZUxvYWRpbmdGaW5pc2hlZCcpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChzZXR0aW5ncy53aW5kb3cuZnVsbHNjcmVlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnNldEZ1bGxTY3JlZW4odHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgd2luZG93LnNldEtpb3NrKFxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0dGluZ3Mud2luZG93Lmtpb3NrICE9PSB1bmRlZmluZWQgPyBzZXR0aW5ncy53aW5kb3cua2lvc2sgOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB3aW5kb3cuc2V0QWx3YXlzT25Ub3AoXG4gICAgICAgICAgICAgICAgICAgICAgICBzZXR0aW5ncy53aW5kb3cuYWx3YXlzT25Ub3AgIT09IHVuZGVmaW5lZCA/IHNldHRpbmdzLndpbmRvdy5hbHdheXNPblRvcCA6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5zaG93KCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogY29uc2lkZXIgZmlyaW5nIGRldmljZSByZWFkeT9cbiAgICAgICAgICAgICAgICAvLyB3ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdCgnXG4gICAgICAgICAgICAgICAgLy8gICAgIGRvY3VtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiZGV2aWNlcmVhZHlcIikpO1xuICAgICAgICAgICAgICAgIC8vICcpO1xuICAgICAgICAgICAgICAgIHN5c3RlbUV2ZW50cy5lbWl0KCdsb2FkaW5nRmluaXNoZWQnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ29uU2VydmVyUmVhZHknKTtcbiAgICAgICAgICAgIHdlYkNvbnRlbnRzLmxvYWRVUkwoJ2h0dHA6Ly8xMjcuMC4wLjE6JyArIHBvcnQgKyAnLycpO1xuICAgICAgICB9LFxuICAgICAgICBmdW5jdGlvbiBvblNlcnZlclJlc3RhcnRlZChwb3J0KSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnb25TZXJ2ZXJSZXN0YXJ0ZWQnKTtcbiAgICAgICAgICAgIHdlYkNvbnRlbnRzLmxvYWRVUkwoJ2h0dHA6Ly8xMjcuMC4wLjE6JyArIHBvcnQgKyAnLycpO1xuICAgICAgICB9XG4gICAgKTtcblxuICAgIGxvY2FsU2VydmVyLmluaXQobW9kdWxlcy5hdXRvdXBkYXRlLmdldERpcmVjdG9yeSgpLCBtb2R1bGVzLmF1dG91cGRhdGUuZ2V0UGFyZW50RGlyZWN0b3J5KCkpO1xufSk7XG5cbmFwcC5vbignd2luZG93LWFsbC1jbG9zZWQnLCBmdW5jdGlvbiBvbkFsbFdpbmRvd0Nsb3NlZCgpIHtcbiAgICBhcHAucXVpdCgpO1xufSk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
