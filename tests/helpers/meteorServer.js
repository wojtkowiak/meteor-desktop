import http from 'http';
import connect from 'connect';
import serveStatic from 'serve-static';
import modRewrite from 'connect-modrewrite';
import findPort from 'find-port';
import enableDestroy from 'server-destroy';
import url from 'url';
import path from 'path';
import fs from 'fs';

function exists(checkPath) {
    try {
        fs.accessSync(checkPath);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Copy of localServer.js slightly adapted to mimick real metoer server.
 * It has a hardcoded port set to 3000.
 *
 * @param {Object} log - Logger instance.
 * @param app
 *
 * @property {Array} errors
 * @constructor
 */
export default class MeteorServer {

    constructor() {
        this.httpServerInstance = null;
        this.server = null;
    }

    /**
     * Sets refs for the callbacks.
     *
     * @param {function} onStartupFailed
     * @param {function} onServerReady
     * @param {function} onServerRestarted
     */
    setCallbacks(onStartupFailed, onServerReady, onServerRestarted) {
        this.onStartupFailed = onStartupFailed;
        this.onServerReady = onServerReady;
        this.onServerRestarted = onServerRestarted;
    }

    /**
     * Initializes the module. Configures `connect`.
     *
     * @param {string} serverPath       - Path for the resources to serve.
     * @param {string} parentServerPath - Path for the parent resources.
     * @param {bool}   restart          - Are we restarting the server?
     */
    init(serverPath, parentServerPath, restart) {
        // `connect` will do the job!
        const server = connect();

        if (restart) {
            if (this.httpServerInstance) {
                this.httpServerInstance.destroy();
            }
        }

        /**
         * Listen on `__cordova` path.
         */
        server.use(modRewrite([
            '^/__cordova/(?!($|manifest.json|app|packages|merged-stylesheets.css|.*meteor_js_' +
            'resource|cordova.js))(.*) /app/$2',
            '^/__cordova/(.*) /$1'
        ]));

        function setSourceMapHeader(req, res, next) {
            const parsedUrl = url.parse(req.url);
            const ext = path.extname(parsedUrl.pathname);
            if ((ext === '.js' || ext === '.css') && (
                    exists(path.join(serverPath, `${parsedUrl.pathname}.map`)) ||
                    (parentServerPath &&
                    exists(path.join(parentServerPath, `${parsedUrl.pathname}.map`)))
                )
            ) {
                res.setHeader('X-SourceMap', `${parsedUrl.pathname}.map?${parsedUrl.query}`);
            }
            next();
        }

        server.use(setSourceMapHeader);

        // Serve files as static from the main directory.
        server.use(serveStatic(serverPath),
            {});

        if (parentServerPath) {
            this.log.info('use ', parentServerPath);

            // Server files from the parent directory as the main bundle has only changed files.
            server.use(serveStatic(parentServerPath),
                {});
        }

        // As last resort we will serve index.html.
        server.use(modRewrite([
            '^(?!.*meteor_dont_serve_index=true)(.*) /index.html'
        ]));

        server.use(serveStatic(serverPath), {});

        this.server = server;

        // The port is hardcoded to 3000.
        this.port = 3000;
        this.startHttpServer(restart);
    }

    /**
     * Tries to start the http server.
     * @param {bool} restart - Is this restart.
     */
    startHttpServer(restart) {
        try {
            this.httpServerInstance = http.createServer(this.server).listen(this.port);
            enableDestroy(this.httpServerInstance);
            if (restart) {
                this.onServerRestarted(this.port);
            } else {
                this.onServerReady(this.port);
            }
        } catch (e) {
            this.onStartupFailed(1);
        }
    }
}

module.exports = MeteorServer;
