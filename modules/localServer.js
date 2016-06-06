var http = require('http');
var connect = require('connect');
var serveStatic = require('serve-static');
var modRewrite = require('connect-modrewrite');
var findPort = require('find-port');
var enableDestroy = require('server-destroy');


/**
 * Local HTTP server tailored for meteor app bundle.
 *
 * @param log
 * @param app
 *
 * @property {Array} errors
 * @constructor
 */
function LocalServer(log, app) {
    this._log = log;
    this._app = app;
    this._serverInstance = null;

    this.errors = [];
    this.errors[0] = 'Could not find free port.';
    this.errors[1] = 'Could not start http server.';
}

LocalServer.prototype.setCallbacks =
    function setCallbacks(onStartupFailed, onServerReady, onServerRestarted) {
        this._onStartupFailed = onStartupFailed;
        this._onServerReady = onServerReady;
        this._onServerRestarted = onServerRestarted;
    };

LocalServer.prototype.init = function init(serverDir, parentServerDir, restart) {
    var self = this;
    var server = connect();

    if (restart) {
        if (this._serverInstance) {
            this._serverInstance.destroy();
        }
    }
    this._log.info('serve: ', serverDir, parentServerDir);

    /**
     * Everything that is:
     * - not starting with `app` or `packages`
     * - not with `css` extension
     * - not with `meteor_js_resource` in the name
     * - not a cordova.js file
     * should be taken from /app/ path.
     */
    server.use(modRewrite([
        '^/(?!($|app|packages|.*css|.*meteor_js_resource|cordova.js))(.*) /app/$2'
    ]));

    // Server files as static from the main directory.
    server.use(serveStatic(serverDir),
        { index: ['index.html'], fallthrough: true });

    if (parentServerDir) {
        this._log.info('use ', parentServerDir);
        // Server files from the parent directory as the main bundle has only changed files.
        server.use(serveStatic(parentServerDir),
            { index: ['index.html'], fallthrough: true });
    }

    // As last resort we will server index.html.
    server.use(modRewrite([
        '^(.*) /index.html'
    ]));

    server.use(serveStatic(serverDir),
        { index: ['index.html'] });

    this._server = server;

    findPort(
        '127.0.0.1',
        8034,
        8063,
        function foundPorts(ports) {
            self._findPortCallback(ports, restart);
        }
    );
};

LocalServer.prototype._findPortCallback = function _findPortCallback(ports, restart) {
    if (ports.length === 0) {
        this._log.error('could not find free port');
        this._onStartupFailed(0);
        return;
    }

    this._port = ports[0];
    this._log.info('assigned port ' + this._port);
    try {
        this._serverInstance = http.createServer(this._server).listen(this._port);
        enableDestroy(this._serverInstance);

        if (restart) {
            this._onServerRestarted(this._port);
        } else {
            this._onServerReady(this._port);
        }
    } catch (e) {
        this._log.error(e);
        this._onStartupFailed(1);
    }
};

module.exports = LocalServer;
