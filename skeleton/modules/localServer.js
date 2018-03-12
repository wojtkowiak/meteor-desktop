import http from 'http';
import connect from 'connect';
import findPort from 'find-port';
import enableDestroy from 'server-destroy';
import url from 'url';
import path from 'path';
import fs from 'fs-plus';
import send from 'send';

const oneYearInSeconds = 60 * 60 * 24 * 365;

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
    constructor({ log, settings = { localFilesystem: false } }) {
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

        this.localFilesystemUrl = '/local-filesystem/';
        this.desktopAssetsUrl = '/___desktop/';
        this.settings = settings;
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
     * @param {AssetBundle} assetBundle - asset bundle from the autoupdate
     * @param {string} desktopPath      - path to desktop.asar
     * @param {boolean} restart         - are we restarting the server?
     * @param {boolean} randomPort      - whether to choose a random port from those found
     *                                    to be free
     */
    init(assetBundle, desktopPath, restart, randomPort = true) {
        // `connect` will do the job!
        const self = this;
        const server = connect();

        if (restart) {
            if (this.httpServerInstance) {
                this.httpServerInstance.destroy();
            }
        }
        this.log.info('will serve from: ', assetBundle.getDirectoryUri());

        /**
         * Responds with HTTP status code and a message.
         *
         * @param {Object} res     - response object
         * @param {number} code    - http response code
         * @param {string} message - message
         */
        function respondWithCode(res, code, message) {
            /* eslint-disable */
            res._headers = {};
            res._headerNames = {};
            res.statusCode = code;
            /* eslint-enable */
            res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
            res.setHeader('Content-Length', Buffer.byteLength(message));
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.end(message);
        }

        /**
         * If there is a path for a source map - adds a X-SourceMap header pointing to it.
         *
         * @param {Asset}  asset - currently sent asset
         * @param {Object} res   - response object
         */
        function addSourceMapHeader(asset, res) {
            if (asset.sourceMapUrlPath) {
                res.setHeader('X-SourceMap', asset.sourceMapUrlPath);
            }
        }

        /**
         * If there is a hash, adds an ETag header with it.
         *
         * @param {Asset}  asset - currently sent asset
         * @param {Object} res   - response object
         */
        function addETagHeader(asset, res) {
            if (asset.hash) {
                res.setHeader('ETag', asset.hash);
            }
        }

        /**
         * If the manifest defines the file as cacheable and query has a cache buster (i.e.
         * hash added to it after ?) adds a Cache-Control header letting know Chrome that this
         * file can be cached. If that is not the case, no-cache is passed.
         *
         * @param {Asset}  asset     - currently sent asset
         * @param {Object} res       - response object
         * @param {string} fullUrl   - url
         */
        function addCacheHeader(asset, res, fullUrl) {
            const shouldCache = asset.cacheable && (/[0-9a-z]{40}/).test(fullUrl);
            res.setHeader('Cache-Control', shouldCache ? `max-age=${oneYearInSeconds}` : 'no-cache');
        }


        /**
         * Provides assets defined in the manifest.
         *
         * @param {Object} req    - request object
         * @param {Object} res    - response object
         * @param {Function} next - called on handler miss
         */
        function AssetHandler(req, res, next) {
            const parsedUrl = url.parse(req.url);

            // Check if we have an asset for that url defined.
            /** @type {Asset} */
            const asset = assetBundle.assetForUrlPath(parsedUrl.pathname);

            return asset ?
                send(req, encodeURIComponent(asset.getFile()), { etag: false, cacheControl: false })
                    .on('file', () =>
                        addSourceMapHeader(asset, res),
                    addETagHeader(asset, res),
                    addCacheHeader(asset, res, req.url))
                    .pipe(res)
                :
                next();
        }

        /**
         * Right now this is only used to serve cordova.js and it might seems like an overkill but
         * it will be used later for serving desktop specific files bundled into meteor bundle.
         *
         * @param {Object} req    - request object
         * @param {Object} res    - response object
         * @param {Function} next - called on handler miss
         */
        function WwwHandler(req, res, next) {
            const parsedUrl = url.parse(req.url);

            if (parsedUrl.pathname !== '/cordova.js') {
                return next();
            }
            const parentAssetBundle = assetBundle.getParentAssetBundle();
            // We need to obtain a path for the initial asset bundle which usually is the parent
            // asset bundle, but if there were not HCPs yet, the main asset bundle is the
            // initial one.
            const initialAssetBundlePath =
                parentAssetBundle ?
                    parentAssetBundle.getDirectoryUri() : assetBundle.getDirectoryUri();

            const filePath = path.join(initialAssetBundlePath, parsedUrl.pathname);

            return fs.existsSync(filePath) ?
                send(req, encodeURIComponent(filePath)).pipe(res) : next();
        }

        /**
         * Provides files from the filesystem on a specified url alias.
         *
         * @param {Object} req        - request object
         * @param {Object} res        - response object
         * @param {Function} next     - called on handler miss
         * @param {string} urlAlias   - url alias on which to serve the files
         * @param {string=} localPath - serve files only from this path
         */
        function FilesystemHandler(req, res, next, urlAlias, localPath) {
            const parsedUrl = url.parse(req.url);
            if (!parsedUrl.pathname.startsWith(urlAlias)) {
                return next();
            }

            const bareUrl = parsedUrl.pathname.substr(urlAlias.length);

            let filePath;
            if (localPath) {
                filePath = path.join(localPath, decodeURIComponent(bareUrl));
                if (filePath.toLowerCase().lastIndexOf(localPath.toLowerCase(), 0) !== 0) {
                    return respondWithCode(res, 400, 'Wrong path.');
                }
            } else {
                filePath = decodeURIComponent(bareUrl);
            }
            return fs.existsSync(filePath) ?
                send(req, encodeURIComponent(filePath)).pipe(res) :
                respondWithCode(res, 404, 'File does not exist.');
        }


        /**
         * Serves files from the entire filesystem if enabled in settings.
         *
         * @param {Object} req        - request object
         * @param {Object} res        - response object
         * @param {Function} next     - called on handler miss
         */
        function LocalFilesystemHandler(req, res, next) {
            if (!self.settings.localFilesystem) {
                return next();
            }
            return FilesystemHandler(req, res, next, self.localFilesystemUrl);
        }

        /**
         * Serves files from the assets directory.
         *
         * @param {Object} req        - request object
         * @param {Object} res        - response object
         * @param {Function} next     - called on handler miss
         */
        function DesktopAssetsHandler(req, res, next) {
            return FilesystemHandler(req, res, next, self.desktopAssetsUrl, path.join(desktopPath, 'assets'));
        }

        /**
         * Serves index.html as the last resort.
         *
         * @param {Object} req        - request object
         * @param {Object} res        - response object
         * @param {Function} next     - called on handler miss
         */
        function IndexHandler(req, res, next) {
            const parsedUrl = url.parse(req.url);
            if (!parsedUrl.pathname.startsWith(self.localFilesystemUrl) &&
                parsedUrl.pathname !== '/favicon.ico'
            ) {
                /** @type {Asset} */
                const indexFile = assetBundle.getIndexFile();
                send(req, encodeURIComponent(indexFile.getFile())).pipe(res);
            } else {
                next();
            }
        }

        server.use(AssetHandler);
        server.use(WwwHandler);
        server.use(LocalFilesystemHandler);
        server.use(DesktopAssetsHandler);
        server.use(IndexHandler);

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
                        ([this.port] = ports);
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
