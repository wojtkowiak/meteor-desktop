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

LocalServer.prototype.setCallbacks = function setCallbacks(onStartupFailed, onServerReady, onServerRestarted) {
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
    server.use(modRewrite(['^/(?!($|app|packages|.*css|.*meteor_js_resource|cordova.js))(.*) /app/$2']));

    // Server files as static from the main directory.
    server.use(serveStatic(serverDir), { index: ['index.html'], fallthrough: true });

    if (parentServerDir) {
        this._log.info('use ', parentServerDir);
        // Server files from the parent directory as the main bundle has only changed files.
        server.use(serveStatic(parentServerDir), { index: ['index.html'], fallthrough: true });
    }

    // As last resort we will server index.html.
    server.use(modRewrite(['^(.*) /index.html']));

    server.use(serveStatic(serverDir), { index: ['index.html'] });

    this._server = server;

    findPort('127.0.0.1', 8034, 8063, function foundPorts(ports) {
        self._findPortCallback(ports, restart);
    });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1vZHVsZXMvbG9jYWxTZXJ2ZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsSUFBSSxPQUFPLFFBQVEsTUFBUixDQUFYO0FBQ0EsSUFBSSxVQUFVLFFBQVEsU0FBUixDQUFkO0FBQ0EsSUFBSSxjQUFjLFFBQVEsY0FBUixDQUFsQjtBQUNBLElBQUksYUFBYSxRQUFRLG9CQUFSLENBQWpCO0FBQ0EsSUFBSSxXQUFXLFFBQVEsV0FBUixDQUFmO0FBQ0EsSUFBSSxnQkFBZ0IsUUFBUSxnQkFBUixDQUFwQjs7Ozs7Ozs7Ozs7QUFZQSxTQUFTLFdBQVQsQ0FBcUIsR0FBckIsRUFBMEIsR0FBMUIsRUFBK0I7QUFDM0IsU0FBSyxJQUFMLEdBQVksR0FBWjtBQUNBLFNBQUssSUFBTCxHQUFZLEdBQVo7QUFDQSxTQUFLLGVBQUwsR0FBdUIsSUFBdkI7O0FBRUEsU0FBSyxNQUFMLEdBQWMsRUFBZDtBQUNBLFNBQUssTUFBTCxDQUFZLENBQVosSUFBaUIsMkJBQWpCO0FBQ0EsU0FBSyxNQUFMLENBQVksQ0FBWixJQUFpQiw4QkFBakI7QUFDSDs7QUFFRCxZQUFZLFNBQVosQ0FBc0IsWUFBdEIsR0FDSSxTQUFTLFlBQVQsQ0FBc0IsZUFBdEIsRUFBdUMsYUFBdkMsRUFBc0QsaUJBQXRELEVBQXlFO0FBQ3JFLFNBQUssZ0JBQUwsR0FBd0IsZUFBeEI7QUFDQSxTQUFLLGNBQUwsR0FBc0IsYUFBdEI7QUFDQSxTQUFLLGtCQUFMLEdBQTBCLGlCQUExQjtBQUNILENBTEw7O0FBT0EsWUFBWSxTQUFaLENBQXNCLElBQXRCLEdBQTZCLFNBQVMsSUFBVCxDQUFjLFNBQWQsRUFBeUIsZUFBekIsRUFBMEMsT0FBMUMsRUFBbUQ7QUFDNUUsUUFBSSxPQUFPLElBQVg7QUFDQSxRQUFJLFNBQVMsU0FBYjs7QUFFQSxRQUFJLE9BQUosRUFBYTtBQUNULFlBQUksS0FBSyxlQUFULEVBQTBCO0FBQ3RCLGlCQUFLLGVBQUwsQ0FBcUIsT0FBckI7QUFDSDtBQUNKO0FBQ0QsU0FBSyxJQUFMLENBQVUsSUFBVixDQUFlLFNBQWYsRUFBMEIsU0FBMUIsRUFBcUMsZUFBckM7Ozs7Ozs7Ozs7QUFVQSxXQUFPLEdBQVAsQ0FBVyxXQUFXLENBQ2xCLDBFQURrQixDQUFYLENBQVg7OztBQUtBLFdBQU8sR0FBUCxDQUFXLFlBQVksU0FBWixDQUFYLEVBQ0ksRUFBRSxPQUFPLENBQUMsWUFBRCxDQUFULEVBQXlCLGFBQWEsSUFBdEMsRUFESjs7QUFHQSxRQUFJLGVBQUosRUFBcUI7QUFDakIsYUFBSyxJQUFMLENBQVUsSUFBVixDQUFlLE1BQWYsRUFBdUIsZUFBdkI7O0FBRUEsZUFBTyxHQUFQLENBQVcsWUFBWSxlQUFaLENBQVgsRUFDSSxFQUFFLE9BQU8sQ0FBQyxZQUFELENBQVQsRUFBeUIsYUFBYSxJQUF0QyxFQURKO0FBRUg7OztBQUdELFdBQU8sR0FBUCxDQUFXLFdBQVcsQ0FDbEIsbUJBRGtCLENBQVgsQ0FBWDs7QUFJQSxXQUFPLEdBQVAsQ0FBVyxZQUFZLFNBQVosQ0FBWCxFQUNJLEVBQUUsT0FBTyxDQUFDLFlBQUQsQ0FBVCxFQURKOztBQUdBLFNBQUssT0FBTCxHQUFlLE1BQWY7O0FBRUEsYUFDSSxXQURKLEVBRUksSUFGSixFQUdJLElBSEosRUFJSSxTQUFTLFVBQVQsQ0FBb0IsS0FBcEIsRUFBMkI7QUFDdkIsYUFBSyxpQkFBTCxDQUF1QixLQUF2QixFQUE4QixPQUE5QjtBQUNILEtBTkw7QUFRSCxDQXBERDs7QUFzREEsWUFBWSxTQUFaLENBQXNCLGlCQUF0QixHQUEwQyxTQUFTLGlCQUFULENBQTJCLEtBQTNCLEVBQWtDLE9BQWxDLEVBQTJDO0FBQ2pGLFFBQUksTUFBTSxNQUFOLEtBQWlCLENBQXJCLEVBQXdCO0FBQ3BCLGFBQUssSUFBTCxDQUFVLEtBQVYsQ0FBZ0IsMEJBQWhCO0FBQ0EsYUFBSyxnQkFBTCxDQUFzQixDQUF0QjtBQUNBO0FBQ0g7O0FBRUQsU0FBSyxLQUFMLEdBQWEsTUFBTSxDQUFOLENBQWI7QUFDQSxTQUFLLElBQUwsQ0FBVSxJQUFWLENBQWUsbUJBQW1CLEtBQUssS0FBdkM7QUFDQSxRQUFJO0FBQ0EsYUFBSyxlQUFMLEdBQXVCLEtBQUssWUFBTCxDQUFrQixLQUFLLE9BQXZCLEVBQWdDLE1BQWhDLENBQXVDLEtBQUssS0FBNUMsQ0FBdkI7QUFDQSxzQkFBYyxLQUFLLGVBQW5COztBQUVBLFlBQUksT0FBSixFQUFhO0FBQ1QsaUJBQUssa0JBQUwsQ0FBd0IsS0FBSyxLQUE3QjtBQUNILFNBRkQsTUFFTztBQUNILGlCQUFLLGNBQUwsQ0FBb0IsS0FBSyxLQUF6QjtBQUNIO0FBQ0osS0FURCxDQVNFLE9BQU8sQ0FBUCxFQUFVO0FBQ1IsYUFBSyxJQUFMLENBQVUsS0FBVixDQUFnQixDQUFoQjtBQUNBLGFBQUssZ0JBQUwsQ0FBc0IsQ0FBdEI7QUFDSDtBQUNKLENBdEJEOztBQXdCQSxPQUFPLE9BQVAsR0FBaUIsV0FBakIiLCJmaWxlIjoibW9kdWxlcy9sb2NhbFNlcnZlci5qcyIsInNvdXJjZXNDb250ZW50IjpbInZhciBodHRwID0gcmVxdWlyZSgnaHR0cCcpO1xyXG52YXIgY29ubmVjdCA9IHJlcXVpcmUoJ2Nvbm5lY3QnKTtcclxudmFyIHNlcnZlU3RhdGljID0gcmVxdWlyZSgnc2VydmUtc3RhdGljJyk7XHJcbnZhciBtb2RSZXdyaXRlID0gcmVxdWlyZSgnY29ubmVjdC1tb2RyZXdyaXRlJyk7XHJcbnZhciBmaW5kUG9ydCA9IHJlcXVpcmUoJ2ZpbmQtcG9ydCcpO1xyXG52YXIgZW5hYmxlRGVzdHJveSA9IHJlcXVpcmUoJ3NlcnZlci1kZXN0cm95Jyk7XHJcblxyXG5cclxuLyoqXHJcbiAqIExvY2FsIEhUVFAgc2VydmVyIHRhaWxvcmVkIGZvciBtZXRlb3IgYXBwIGJ1bmRsZS5cclxuICpcclxuICogQHBhcmFtIGxvZ1xyXG4gKiBAcGFyYW0gYXBwXHJcbiAqXHJcbiAqIEBwcm9wZXJ0eSB7QXJyYXl9IGVycm9yc1xyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIExvY2FsU2VydmVyKGxvZywgYXBwKSB7XHJcbiAgICB0aGlzLl9sb2cgPSBsb2c7XHJcbiAgICB0aGlzLl9hcHAgPSBhcHA7XHJcbiAgICB0aGlzLl9zZXJ2ZXJJbnN0YW5jZSA9IG51bGw7XHJcblxyXG4gICAgdGhpcy5lcnJvcnMgPSBbXTtcclxuICAgIHRoaXMuZXJyb3JzWzBdID0gJ0NvdWxkIG5vdCBmaW5kIGZyZWUgcG9ydC4nO1xyXG4gICAgdGhpcy5lcnJvcnNbMV0gPSAnQ291bGQgbm90IHN0YXJ0IGh0dHAgc2VydmVyLic7XHJcbn1cclxuXHJcbkxvY2FsU2VydmVyLnByb3RvdHlwZS5zZXRDYWxsYmFja3MgPVxyXG4gICAgZnVuY3Rpb24gc2V0Q2FsbGJhY2tzKG9uU3RhcnR1cEZhaWxlZCwgb25TZXJ2ZXJSZWFkeSwgb25TZXJ2ZXJSZXN0YXJ0ZWQpIHtcclxuICAgICAgICB0aGlzLl9vblN0YXJ0dXBGYWlsZWQgPSBvblN0YXJ0dXBGYWlsZWQ7XHJcbiAgICAgICAgdGhpcy5fb25TZXJ2ZXJSZWFkeSA9IG9uU2VydmVyUmVhZHk7XHJcbiAgICAgICAgdGhpcy5fb25TZXJ2ZXJSZXN0YXJ0ZWQgPSBvblNlcnZlclJlc3RhcnRlZDtcclxuICAgIH07XHJcblxyXG5Mb2NhbFNlcnZlci5wcm90b3R5cGUuaW5pdCA9IGZ1bmN0aW9uIGluaXQoc2VydmVyRGlyLCBwYXJlbnRTZXJ2ZXJEaXIsIHJlc3RhcnQpIHtcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIHZhciBzZXJ2ZXIgPSBjb25uZWN0KCk7XHJcblxyXG4gICAgaWYgKHJlc3RhcnQpIHtcclxuICAgICAgICBpZiAodGhpcy5fc2VydmVySW5zdGFuY2UpIHtcclxuICAgICAgICAgICAgdGhpcy5fc2VydmVySW5zdGFuY2UuZGVzdHJveSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHRoaXMuX2xvZy5pbmZvKCdzZXJ2ZTogJywgc2VydmVyRGlyLCBwYXJlbnRTZXJ2ZXJEaXIpO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogRXZlcnl0aGluZyB0aGF0IGlzOlxyXG4gICAgICogLSBub3Qgc3RhcnRpbmcgd2l0aCBgYXBwYCBvciBgcGFja2FnZXNgXHJcbiAgICAgKiAtIG5vdCB3aXRoIGBjc3NgIGV4dGVuc2lvblxyXG4gICAgICogLSBub3Qgd2l0aCBgbWV0ZW9yX2pzX3Jlc291cmNlYCBpbiB0aGUgbmFtZVxyXG4gICAgICogLSBub3QgYSBjb3Jkb3ZhLmpzIGZpbGVcclxuICAgICAqIHNob3VsZCBiZSB0YWtlbiBmcm9tIC9hcHAvIHBhdGguXHJcbiAgICAgKi9cclxuICAgIHNlcnZlci51c2UobW9kUmV3cml0ZShbXHJcbiAgICAgICAgJ14vKD8hKCR8YXBwfHBhY2thZ2VzfC4qY3NzfC4qbWV0ZW9yX2pzX3Jlc291cmNlfGNvcmRvdmEuanMpKSguKikgL2FwcC8kMidcclxuICAgIF0pKTtcclxuXHJcbiAgICAvLyBTZXJ2ZXIgZmlsZXMgYXMgc3RhdGljIGZyb20gdGhlIG1haW4gZGlyZWN0b3J5LlxyXG4gICAgc2VydmVyLnVzZShzZXJ2ZVN0YXRpYyhzZXJ2ZXJEaXIpLFxyXG4gICAgICAgIHsgaW5kZXg6IFsnaW5kZXguaHRtbCddLCBmYWxsdGhyb3VnaDogdHJ1ZSB9KTtcclxuXHJcbiAgICBpZiAocGFyZW50U2VydmVyRGlyKSB7XHJcbiAgICAgICAgdGhpcy5fbG9nLmluZm8oJ3VzZSAnLCBwYXJlbnRTZXJ2ZXJEaXIpO1xyXG4gICAgICAgIC8vIFNlcnZlciBmaWxlcyBmcm9tIHRoZSBwYXJlbnQgZGlyZWN0b3J5IGFzIHRoZSBtYWluIGJ1bmRsZSBoYXMgb25seSBjaGFuZ2VkIGZpbGVzLlxyXG4gICAgICAgIHNlcnZlci51c2Uoc2VydmVTdGF0aWMocGFyZW50U2VydmVyRGlyKSxcclxuICAgICAgICAgICAgeyBpbmRleDogWydpbmRleC5odG1sJ10sIGZhbGx0aHJvdWdoOiB0cnVlIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFzIGxhc3QgcmVzb3J0IHdlIHdpbGwgc2VydmVyIGluZGV4Lmh0bWwuXHJcbiAgICBzZXJ2ZXIudXNlKG1vZFJld3JpdGUoW1xyXG4gICAgICAgICdeKC4qKSAvaW5kZXguaHRtbCdcclxuICAgIF0pKTtcclxuXHJcbiAgICBzZXJ2ZXIudXNlKHNlcnZlU3RhdGljKHNlcnZlckRpciksXHJcbiAgICAgICAgeyBpbmRleDogWydpbmRleC5odG1sJ10gfSk7XHJcblxyXG4gICAgdGhpcy5fc2VydmVyID0gc2VydmVyO1xyXG5cclxuICAgIGZpbmRQb3J0KFxyXG4gICAgICAgICcxMjcuMC4wLjEnLFxyXG4gICAgICAgIDgwMzQsXHJcbiAgICAgICAgODA2MyxcclxuICAgICAgICBmdW5jdGlvbiBmb3VuZFBvcnRzKHBvcnRzKSB7XHJcbiAgICAgICAgICAgIHNlbGYuX2ZpbmRQb3J0Q2FsbGJhY2socG9ydHMsIHJlc3RhcnQpO1xyXG4gICAgICAgIH1cclxuICAgICk7XHJcbn07XHJcblxyXG5Mb2NhbFNlcnZlci5wcm90b3R5cGUuX2ZpbmRQb3J0Q2FsbGJhY2sgPSBmdW5jdGlvbiBfZmluZFBvcnRDYWxsYmFjayhwb3J0cywgcmVzdGFydCkge1xyXG4gICAgaWYgKHBvcnRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIHRoaXMuX2xvZy5lcnJvcignY291bGQgbm90IGZpbmQgZnJlZSBwb3J0Jyk7XHJcbiAgICAgICAgdGhpcy5fb25TdGFydHVwRmFpbGVkKDApO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9wb3J0ID0gcG9ydHNbMF07XHJcbiAgICB0aGlzLl9sb2cuaW5mbygnYXNzaWduZWQgcG9ydCAnICsgdGhpcy5fcG9ydCk7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIHRoaXMuX3NlcnZlckluc3RhbmNlID0gaHR0cC5jcmVhdGVTZXJ2ZXIodGhpcy5fc2VydmVyKS5saXN0ZW4odGhpcy5fcG9ydCk7XHJcbiAgICAgICAgZW5hYmxlRGVzdHJveSh0aGlzLl9zZXJ2ZXJJbnN0YW5jZSk7XHJcblxyXG4gICAgICAgIGlmIChyZXN0YXJ0KSB7XHJcbiAgICAgICAgICAgIHRoaXMuX29uU2VydmVyUmVzdGFydGVkKHRoaXMuX3BvcnQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuX29uU2VydmVyUmVhZHkodGhpcy5fcG9ydCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIHRoaXMuX2xvZy5lcnJvcihlKTtcclxuICAgICAgICB0aGlzLl9vblN0YXJ0dXBGYWlsZWQoMSk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IExvY2FsU2VydmVyO1xyXG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
