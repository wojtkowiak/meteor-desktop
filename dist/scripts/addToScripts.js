"use strict";

var _path = _interopRequireDefault(require("path"));

var _addScript = _interopRequireDefault(require("./utils/addScript"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable no-console */

/**
 * This script adds a 'desktop' entry to 'scripts' in package.json. If the entry already exists
 * it leaves it untouched.
 */
function fail() {
  console.error('[meteor-desktop] failed to add meteor-desktop to your package.json scripts, ' + 'please add it manually as \'desktop\': \'meteor-desktop\'');
  process.exit(0);
}

const packageJsonPath = _path.default.resolve(_path.default.join(__dirname, '..', '..', '..', '..', 'package.json'));

(0, _addScript.default)('desktop', 'meteor-desktop', packageJsonPath, fail);
console.log('[meteor-desktop] successfully added a \'desktop\' entry to your package.json' + ' scripts section.');
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJmYWlsIiwiY29uc29sZSIsImVycm9yIiwicHJvY2VzcyIsImV4aXQiLCJwYWNrYWdlSnNvblBhdGgiLCJwYXRoIiwicmVzb2x2ZSIsImpvaW4iLCJfX2Rpcm5hbWUiLCJhZGRTY3JpcHQiLCJsb2ciXSwic291cmNlcyI6WyIuLi8uLi9saWIvc2NyaXB0cy9hZGRUb1NjcmlwdHMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5cbmltcG9ydCBhZGRTY3JpcHQgZnJvbSAnLi91dGlscy9hZGRTY3JpcHQnO1xuLyoqXG4gKiBUaGlzIHNjcmlwdCBhZGRzIGEgJ2Rlc2t0b3AnIGVudHJ5IHRvICdzY3JpcHRzJyBpbiBwYWNrYWdlLmpzb24uIElmIHRoZSBlbnRyeSBhbHJlYWR5IGV4aXN0c1xuICogaXQgbGVhdmVzIGl0IHVudG91Y2hlZC5cbiAqL1xuZnVuY3Rpb24gZmFpbCgpIHtcbiAgICBjb25zb2xlLmVycm9yKCdbbWV0ZW9yLWRlc2t0b3BdIGZhaWxlZCB0byBhZGQgbWV0ZW9yLWRlc2t0b3AgdG8geW91ciBwYWNrYWdlLmpzb24gc2NyaXB0cywgJyArXG4gICAgICAgICdwbGVhc2UgYWRkIGl0IG1hbnVhbGx5IGFzIFxcJ2Rlc2t0b3BcXCc6IFxcJ21ldGVvci1kZXNrdG9wXFwnJyk7XG4gICAgcHJvY2Vzcy5leGl0KDApO1xufVxuXG5jb25zdCBwYWNrYWdlSnNvblBhdGggPSBwYXRoLnJlc29sdmUoXG4gICAgcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uJywgJy4uJywgJy4uJywgJy4uJywgJ3BhY2thZ2UuanNvbicpXG4pO1xuXG5hZGRTY3JpcHQoJ2Rlc2t0b3AnLCAnbWV0ZW9yLWRlc2t0b3AnLCBwYWNrYWdlSnNvblBhdGgsIGZhaWwpO1xuXG5jb25zb2xlLmxvZygnW21ldGVvci1kZXNrdG9wXSBzdWNjZXNzZnVsbHkgYWRkZWQgYSBcXCdkZXNrdG9wXFwnIGVudHJ5IHRvIHlvdXIgcGFja2FnZS5qc29uJyArXG4gICAgJyBzY3JpcHRzIHNlY3Rpb24uJyk7XG4iXSwibWFwcGluZ3MiOiI7O0FBQ0E7O0FBRUE7Ozs7QUFIQTs7QUFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVNBLElBQVQsR0FBZ0I7RUFDWkMsT0FBTyxDQUFDQyxLQUFSLENBQWMsaUZBQ1YsMkRBREo7RUFFQUMsT0FBTyxDQUFDQyxJQUFSLENBQWEsQ0FBYjtBQUNIOztBQUVELE1BQU1DLGVBQWUsR0FBR0MsYUFBQSxDQUFLQyxPQUFMLENBQ3BCRCxhQUFBLENBQUtFLElBQUwsQ0FBVUMsU0FBVixFQUFxQixJQUFyQixFQUEyQixJQUEzQixFQUFpQyxJQUFqQyxFQUF1QyxJQUF2QyxFQUE2QyxjQUE3QyxDQURvQixDQUF4Qjs7QUFJQSxJQUFBQyxrQkFBQSxFQUFVLFNBQVYsRUFBcUIsZ0JBQXJCLEVBQXVDTCxlQUF2QyxFQUF3REwsSUFBeEQ7QUFFQUMsT0FBTyxDQUFDVSxHQUFSLENBQVksaUZBQ1IsbUJBREoifQ==