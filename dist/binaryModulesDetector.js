"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _path = _interopRequireDefault(require("path"));

var _isbinaryfile = _interopRequireDefault(require("isbinaryfile"));

var _shelljs = _interopRequireDefault(require("shelljs"));

var _log = _interopRequireDefault(require("./log"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

_shelljs.default.config.fatal = true;
/**
 * Experimental module for detecting modules containing binary files.
 * Based on the same functionality from electron-builder.
 *
 * @property {MeteorDesktop} $
 * @class
 */

class BinaryModulesDetector {
  /**
   * @constructor
   */
  constructor(nodeModulesPath) {
    this.log = new _log.default('binaryModulesDetector');
    this.nodeModulesPath = nodeModulesPath;
  } // TODO: make asynchronous


  detect() {
    this.log.verbose('detecting node modules with binary files');

    const files = _shelljs.default.ls('-RAl', this.nodeModulesPath);

    const extract = [];
    files.forEach(file => {
      const pathSplit = file.name.split(_path.default.posix.sep);
      const dir = pathSplit[0];
      const filename = pathSplit.pop();

      if (extract.indexOf(dir) === -1 && !BinaryModulesDetector.shouldBeIgnored(dir, filename)) {
        if (file.isFile()) {
          let shouldUnpack = false;

          if (file.name.endsWith('.dll') || file.name.endsWith('.exe') || file.name.endsWith('.dylib')) {
            shouldUnpack = true;
          } else if (_path.default.extname(file.name) === '') {
            shouldUnpack = _isbinaryfile.default.sync(_path.default.join(this.nodeModulesPath, file.name));
          }

          if (shouldUnpack) {
            this.log.debug(`binary file: ${file.name}`);
            extract.push(dir);
          }
        }
      }
    });

    if (extract.length > 0) {
      this.log.verbose(`detected modules to be extracted: ${extract.join(', ')}`);
    }

    return extract;
  }

  static shouldBeIgnored(dir, filename) {
    return dir === '.bin' || filename === '.DS_Store' || filename === 'LICENSE' || filename === 'README';
  }

}

exports.default = BinaryModulesDetector;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJzaGVsbCIsImNvbmZpZyIsImZhdGFsIiwiQmluYXJ5TW9kdWxlc0RldGVjdG9yIiwiY29uc3RydWN0b3IiLCJub2RlTW9kdWxlc1BhdGgiLCJsb2ciLCJMb2ciLCJkZXRlY3QiLCJ2ZXJib3NlIiwiZmlsZXMiLCJscyIsImV4dHJhY3QiLCJmb3JFYWNoIiwiZmlsZSIsInBhdGhTcGxpdCIsIm5hbWUiLCJzcGxpdCIsInBhdGgiLCJwb3NpeCIsInNlcCIsImRpciIsImZpbGVuYW1lIiwicG9wIiwiaW5kZXhPZiIsInNob3VsZEJlSWdub3JlZCIsImlzRmlsZSIsInNob3VsZFVucGFjayIsImVuZHNXaXRoIiwiZXh0bmFtZSIsImlzQmluYXJ5RmlsZSIsInN5bmMiLCJqb2luIiwiZGVidWciLCJwdXNoIiwibGVuZ3RoIl0sInNvdXJjZXMiOlsiLi4vbGliL2JpbmFyeU1vZHVsZXNEZXRlY3Rvci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBpc0JpbmFyeUZpbGUgZnJvbSAnaXNiaW5hcnlmaWxlJztcbmltcG9ydCBzaGVsbCBmcm9tICdzaGVsbGpzJztcblxuaW1wb3J0IExvZyBmcm9tICcuL2xvZyc7XG5cbnNoZWxsLmNvbmZpZy5mYXRhbCA9IHRydWU7XG4vKipcbiAqIEV4cGVyaW1lbnRhbCBtb2R1bGUgZm9yIGRldGVjdGluZyBtb2R1bGVzIGNvbnRhaW5pbmcgYmluYXJ5IGZpbGVzLlxuICogQmFzZWQgb24gdGhlIHNhbWUgZnVuY3Rpb25hbGl0eSBmcm9tIGVsZWN0cm9uLWJ1aWxkZXIuXG4gKlxuICogQHByb3BlcnR5IHtNZXRlb3JEZXNrdG9wfSAkXG4gKiBAY2xhc3NcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQmluYXJ5TW9kdWxlc0RldGVjdG9yIHtcbiAgICAvKipcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3Rvcihub2RlTW9kdWxlc1BhdGgpIHtcbiAgICAgICAgdGhpcy5sb2cgPSBuZXcgTG9nKCdiaW5hcnlNb2R1bGVzRGV0ZWN0b3InKTtcbiAgICAgICAgdGhpcy5ub2RlTW9kdWxlc1BhdGggPSBub2RlTW9kdWxlc1BhdGg7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogbWFrZSBhc3luY2hyb25vdXNcbiAgICBkZXRlY3QoKSB7XG4gICAgICAgIHRoaXMubG9nLnZlcmJvc2UoJ2RldGVjdGluZyBub2RlIG1vZHVsZXMgd2l0aCBiaW5hcnkgZmlsZXMnKTtcbiAgICAgICAgY29uc3QgZmlsZXMgPSBzaGVsbC5scygnLVJBbCcsIHRoaXMubm9kZU1vZHVsZXNQYXRoKTtcblxuICAgICAgICBjb25zdCBleHRyYWN0ID0gW107XG5cbiAgICAgICAgZmlsZXMuZm9yRWFjaCgoZmlsZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGF0aFNwbGl0ID0gZmlsZS5uYW1lLnNwbGl0KHBhdGgucG9zaXguc2VwKTtcbiAgICAgICAgICAgIGNvbnN0IGRpciA9IHBhdGhTcGxpdFswXTtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVuYW1lID0gcGF0aFNwbGl0LnBvcCgpO1xuXG4gICAgICAgICAgICBpZiAoZXh0cmFjdC5pbmRleE9mKGRpcikgPT09IC0xICYmXG4gICAgICAgICAgICAgICAgIUJpbmFyeU1vZHVsZXNEZXRlY3Rvci5zaG91bGRCZUlnbm9yZWQoZGlyLCBmaWxlbmFtZSlcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIGlmIChmaWxlLmlzRmlsZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBzaG91bGRVbnBhY2sgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpbGUubmFtZS5lbmRzV2l0aCgnLmRsbCcpIHx8IGZpbGUubmFtZS5lbmRzV2l0aCgnLmV4ZScpIHx8IGZpbGUubmFtZS5lbmRzV2l0aCgnLmR5bGliJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNob3VsZFVucGFjayA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocGF0aC5leHRuYW1lKGZpbGUubmFtZSkgPT09ICcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzaG91bGRVbnBhY2sgPVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzQmluYXJ5RmlsZS5zeW5jKHBhdGguam9pbih0aGlzLm5vZGVNb2R1bGVzUGF0aCwgZmlsZS5uYW1lKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHNob3VsZFVucGFjaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2cuZGVidWcoYGJpbmFyeSBmaWxlOiAke2ZpbGUubmFtZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3QucHVzaChkaXIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKGV4dHJhY3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdGhpcy5sb2cudmVyYm9zZShgZGV0ZWN0ZWQgbW9kdWxlcyB0byBiZSBleHRyYWN0ZWQ6ICR7ZXh0cmFjdC5qb2luKCcsICcpfWApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBleHRyYWN0O1xuICAgIH1cblxuICAgIHN0YXRpYyBzaG91bGRCZUlnbm9yZWQoZGlyLCBmaWxlbmFtZSkge1xuICAgICAgICByZXR1cm4gZGlyID09PSAnLmJpbicgfHwgZmlsZW5hbWUgPT09ICcuRFNfU3RvcmUnIHx8IGZpbGVuYW1lID09PSAnTElDRU5TRScgfHwgZmlsZW5hbWUgPT09ICdSRUFETUUnO1xuICAgIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUVBOzs7O0FBRUFBLGdCQUFBLENBQU1DLE1BQU4sQ0FBYUMsS0FBYixHQUFxQixJQUFyQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7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