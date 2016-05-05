import http from 'http';
import connect from 'connect';
import serveStatic from 'serve-static';
import modRewrite from 'connect-modrewrite';
import url from 'url';
import path from 'path';
import fs from 'fs';
import sha1File from 'sha1-file';
import enableDestroy from 'server-destroy';

import paths from '../paths';

let meteorServer;

function exists(checkPath) {
    try {
        fs.accessSync(checkPath);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Copy of localServer.js slightly adapted to mimic real meteor server.
 * It has a hardcoded port set to 3788.
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
        this.receivedRequests = [];
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
        const self = this;
        // `connect` will do the job!
        const server = connect();

        if (restart) {
            if (this.httpServerInstance) {
                this.httpServerInstance.destroy();
            }
        }
        function saveRequests(req, res, next) {
            const parsedUrl = url.parse(req.url);
            self.receivedRequests.push(parsedUrl.pathname);
            next();
        }

        server.use(saveRequests);

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

        function setETag(req, res, next) {
            const parsedUrl = url.parse(req.url);
            let pathname = parsedUrl.pathname;
            if (pathname === '/') {
                pathname = '/index.html';
            }
            if (
                exists(path.join(serverPath, pathname))
            ) {
                res.setHeader('ETag', `"${sha1File(path.join(serverPath, pathname))}"`);
            }
            if (parentServerPath &&
                exists(path.join(parentServerPath, pathname))) {
                res.setHeader('ETag', `"${sha1File(path.join(parentServerPath, pathname))}"`);
            }
            next();
        }

        server.use(setETag);

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

        // The port is hardcoded to 3788.
        this.port = 3788;

        this.startHttpServer(restart);
    }

    /**
     * Tries to start the http server.
     * @param {bool} restart - Is this restart.
     */
    startHttpServer(restart) {
        try {
            this.httpServerInstance = http.createServer(this.server);
            this.httpServerInstance.on('error', (e) => {
                this.onStartupFailed(e);
            });
            this.httpServerInstance.on('listening', () => {
                if (restart) {
                    this.onServerRestarted(this.port);
                } else {
                    this.onServerReady(this.port);
                }
            });
            this.httpServerInstance.listen(this.port);
            enableDestroy(this.httpServerInstance);
        } catch (e) {
            this.onStartupFailed(e);
        }
    }
}

/**
 * Runs fake meteor server and serves a version from the fixtures.
 * @param {string} version
 * @returns {*}
 */
export function serveVersion(version) {
    if (!meteorServer) {
        return new Promise((resolve, reject) => {
            meteorServer = new MeteorServer({
                info() {
                },
                error() {
                }
            });
            function onStartupFailed(e) {
                reject(e);
            }

            function onServerReady() {
                resolve(meteorServer);
            }

            function onServerRestarted() {
            }

            meteorServer.setCallbacks(onStartupFailed, onServerReady, onServerRestarted);
            meteorServer.init(path.join(paths.fixtures.downloadableVersions, version));
        });
    }
    meteorServer.init(path.join(paths.fixtures.downloadableVersions, version), undefined, true);
    return Promise.resolve(meteorServer);
}

module.exports = { serveVersion };
