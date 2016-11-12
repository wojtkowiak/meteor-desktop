import http from 'http';
import connect from 'connect';
import serveStatic from 'serve-static';
import modRewrite from 'connect-modrewrite';
import findPort from 'find-port';
import enableDestroy from 'server-destroy';
import url from 'url';
import path from 'path';
import fs from 'fs-plus';

/**
 * Simple local HTTP server tailored for meteor app bundle.
 *
 * @param {Object} log - Logger instance
 * @param app
 *
 * @property {Array} errors
 * @constructor
 */
export default class LocalServer {

    constructor({ log }) {
        this.log = log;
        this.httpServerInstance = null;
        this.server = null;
        this.retries = 0;
        this.maxRetries = 3;
        this.serverPath = '';
        this.parentServerPath = '';

        this.errors = [];
        this.errors[0] = 'Could not find free port.';
        this.errors[1] = 'Could not start http server.';
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
     * Initializes the module. Configures `connect` and searches for free port.
     *
     * @param {string} serverPath       - path for the resources to serve
     * @param {string} parentServerPath - path for the parent resources
     * @param {boolean} restart         - are we restarting the server?
     * @param {boolean} randomPort      - whether to choose a random port from those found
     *                                    to be free
     */
    init(serverPath, parentServerPath, restart, randomPort = true) {
        // `connect` will do the job!
        const server = connect();
        this.serverPath = serverPath;
        this.parentServerPath = parentServerPath;

        if (restart) {
            if (this.httpServerInstance) {
                this.httpServerInstance.destroy();
            }
        }
        this.log.info('will serve from: ', serverPath, parentServerPath);

        // Here, instead of reading the manifest and serving assets based on urls defined there,
        // we are making a shortcut implementation which is just doing a simple regex rewrite to
        // the urls.

        // TODO: is serving on actual manifest better in any way? or faster?
        // Answer 1: It would be better to have it so we would not have to check for a sourcemap
        // file existence.
        // Answer 2: We can not set a proper Cache header without manifest.
        // Answer 3: We will still serve files that have been deleted in the new version - hard
        // to say if that is a real problem.

        /**
         * Everything that is:
         * - not starting with `app` or `packages`
         * - not a merged-stylesheets.css
         * - not with `meteor_[js/css]_resource` in the name
         * - not a cordova.js file
         * should be taken from /app/ path.
         */
        server.use(modRewrite([
            '^/favicon.ico [R=404,L,NS]',
            '^/(?!($|app|packages|merged-stylesheets(?:-prefixed)?.css|' +
            '.*meteor_(?:js|css)_resource|cordova.js))(.*) /app/$2'
        ]));

        function setSourceMapHeader(req, res, next) {
            const parsedUrl = url.parse(req.url);
            const ext = path.extname(parsedUrl.pathname);
            // Now here it would be very useful to actually read the manifest and server sourcemaps
            // according to it. For now just checking if a sourcemap for a file exits.
            if ((ext === '.js' || ext === '.css') && (
                    fs.existsSync(path.join(serverPath, `${parsedUrl.pathname}.map`)) ||
                    (parentServerPath &&
                    fs.existsSync(path.join(parentServerPath, `${parsedUrl.pathname}.map`)))
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
            // Server files from the parent directory as the main bundle has only changed files.
            server.use(serveStatic(parentServerPath),
                {});
        }

        // As last resort we will serve index.html.
        server.use(modRewrite([
            '^(.*) /index.html'
        ]));

        server.use(serveStatic(serverPath), {});

        this.server = server;

        this.findPort(randomPort)
            .then(() => {
                this.startHttpServer(restart);
            })
            .catch(() => {
                this.log.error('could not find free port');
                this.onStartupFailed(0);
            });
    }

    /**
     * Checks if we have a free port.
     * @returns {Promise}
     */
    findPort(randomPort) {
        return new Promise((resolve, reject) => {
            findPort(
                '127.0.0.1',
                8034,
                8063,
                (ports) => {
                    if (ports.length === 0) {
                        reject();
                    }

                    if (randomPort) {
                        this.port = ports[Math.floor(Math.random() * (ports.length - 1))];
                    } else {
                        this.port = ports[0];
                    }

                    this.log.info(`assigned port ${this.port}`);
                    resolve();
                }
            );
        });
    }

    /**
     * Tries to start the http server.
     * @param {bool} restart - is this restart
     */
    startHttpServer(restart) {
        try {
            this.httpServerInstance = http.createServer(this.server);
            this.httpServerInstance.on('error', (e) => {
                this.log.error(e);
                this.retries += 1;
                if (this.retries < this.maxRetries) {
                    this.init(this.serverPath, this.parentServerPath, true);
                } else {
                    this.onStartupFailed(1);
                }
            });
            this.httpServerInstance.on('listening', () => {
                this.retries = 0;
                if (restart) {
                    this.onServerRestarted(this.port);
                } else {
                    this.onServerReady(this.port);
                }
            });
            this.httpServerInstance.listen(this.port, '127.0.0.1');
            enableDestroy(this.httpServerInstance);
        } catch (e) {
            this.log.error(e);
            this.onStartupFailed(1);
        }
    }
}

module.exports = LocalServer;
