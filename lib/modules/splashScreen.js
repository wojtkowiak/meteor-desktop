/**
 * Implements simple splashscreen for Electron.
 *
 * @param {Object} settings
 * @param {Object} fs
 * @param {Object} log
 * @param {Function} join
 * @param {Object} browser
 * @constructor
 */
function SplashScreen(settings, fs, log, path, browser) {
    var join = path.join;
    this._log = log;
    this._settings = settings;
    this._splashHtml = join(__dirname, '..', 'splash.html');
    this._splashHtmlAbsolute = path.resolve(this._splashHtml);
    this._splashHtmlTemplate = join(__dirname, 'splashScreen', 'splash.html');
    this._opened = false;
    this._browser = browser;
    this._fs = fs;
    if (settings.splashScreen && !fs.existsSync(this._splashHtml)) {
        this._prepare();
    }
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

    this._splashWindow = new this._browser({
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
