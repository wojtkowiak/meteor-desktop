import http from 'http';
import connect from 'connect';
import serveStatic from 'serve-static';
import modRewrite from 'connect-modrewrite';
import findPort from 'find-port';
import enableDestroy from 'server-destroy';

/**
 * Simple local HTTP server tailored for meteor app bundle.
 *
 * @param {Object} log - Logger instance.
 * @param app
 *
 * @property {Array} errors
 * @constructor
 */
export default class LocalServer {

    constructor(log) {
        this.log = log;
        this.httpServerInstance = null;
        this.server = null;

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
        this.log.info('serve: ', serverPath, parentServerPath);

        // Here, instead of reading the manifest and serving assets based on urls defined there,
        // we are making a shortcut implementation which is just doing a simple regex rewrite to
        // the urls.

        // TODO: is serving on actual manifest better in any way? or faster?
        // TODO: is there any case not supported here?

        /**
         * Everything that is:
         * - not starting with `app` or `packages`
         * - not with `css` extension
         * - not with `meteor_js_resource` in the name
         * - not a cordova.js file
         * should be taken from /app/ path.
         */
        server.use(modRewrite([
            '^/favicon.ico [R=404,L,NS]',
            '^/(?!($|app|packages|.*css|.*meteor_js_resource|cordova.js))(.*) /app/$2'
        ]));

        // Serve files as static from the main directory.
        server.use(serveStatic(serverPath),
            { fallthrough: true, etag: false });

        if (parentServerPath) {
            this.log.info('use ', parentServerPath);

            // Server files from the parent directory as the main bundle has only changed files.
            server.use(serveStatic(parentServerPath),
                { fallthrough: true, etag: false });
        }

        // As last resort we will serve index.html.
        server.use(modRewrite([
            '^(.*) /index.html'
        ]));

        server.use(serveStatic(serverPath),
            { etag: false });

        this.server = server;

        this.findPort(restart)
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
    findPort() {
        return new Promise((resolve, reject) => {
            findPort(
                '127.0.0.1',
                8034,
                8063,
                ports => {
                    if (ports.length === 0) {
                        reject();
                    }

                    this.port = ports[0];
                    this.log.info(`assigned port ${this.port}`);
                    resolve();
                }
            );
        });
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
            this.log.error(e);
            this.onStartupFailed(1);
        }
    }
}

module.exports = LocalServer;
