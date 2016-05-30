var Browser = require('electron').BrowserWindow;
var path = require('path');
var fs = require('fs');

/**
 * Implements simple splashscreen for Electron.
 *
 * @param {Object} log
 * @param {Object} app
 * @param {Object} settings
 * @param {Object} systemEvents
 * @constructor
 */
function SplashScreen(log, app, settings, systemEvents) {
    var join = path.join;
    var self = this;

    this._log = log;
    this._settings = settings;
    this._splashHtml = join(__dirname, '..', '..', 'splash.html');
    this._splashHtmlAbsolute = path.resolve(this._splashHtml);
    this._splashHtmlTemplate = join(__dirname, 'splash.html');
    this._opened = false;
    this._fs = fs;

    systemEvents.on('beforeInitialization', function show() {
        if (settings.splashScreen) {
            self._prepare();
        }
        self.show();
    });

    systemEvents.on('beforeLoadingFinished', this.close.bind(this));
    systemEvents.on('startupFailed', this.close.bind(this));
    systemEvents.on('unhandledException', this.close.bind(this));

    this._log.debug('registered event');
}

SplashScreen.prototype._prepare = function _prepare() {
    var splashHTML;
    if (!this._settings.splashScreen) return;

    this._log.info('writing splashscreen');

    splashHTML = this._fs.readFileSync(this._splashHtmlTemplate, 'UTF-8');
    splashHTML = splashHTML.replace('{title}', this._settings.name);
    splashHTML = splashHTML.replace('{splash}', 'splash_screen.png');
    this._fs.writeFileSync(this._splashHtml, splashHTML);

    this._log.info('wrote splashscreen');
};

SplashScreen.prototype.show = function show() {
    var self = this;
    if (!this._settings.splashScreen) return;

    this._log.info('displaying splashscreen from file://' + this._splashHtmlAbsolute);

    this._splashWindow = new Browser({
        width: 1024, height: 768,
        alwaysOnTop: true,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: { nodeIntegration: false }
    });

    this._opened = true;

    this._splashWindow.on('closed', function onClosed() {
        self._opened = false;
    });
    this._splashWindow.webContents.closeDevTools();

    this._splashWindow.loadURL('file://' + this._splashHtmlAbsolute);
};

SplashScreen.prototype.close = function close() {
    if (!this._settings.splashScreen) return;
    if (this._opened) {
        this._splashWindow.close();
    }
};

module.exports = SplashScreen;
