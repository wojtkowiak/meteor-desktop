"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _runtime = _interopRequireDefault(require("regenerator-runtime/runtime"));

var _crossSpawn = _interopRequireDefault(require("cross-spawn"));

var _log = _interopRequireDefault(require("./log"));

var _defaultDependencies = _interopRequireDefault(require("./defaultDependencies"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Simple Electron runner. Runs the project with the bin provided by the 'electron' package.
 * @class
 */
class Electron {
  constructor($) {
    this.log = new _log.default('electron');
    this.$ = $;
  }

  async init() {
    this.electron = await this.$.getDependency('electron', _defaultDependencies.default.electron);
  }

  run() {
    // Until: https://github.com/electron-userland/electron-prebuilt/pull/118
    const {
      env
    } = process;
    env.ELECTRON_ENV = 'development';
    const cmd = [];

    if (this.$.env.options.debug) {
      cmd.push('--debug=5858');
    }

    cmd.push('.');
    const child = (0, _crossSpawn.default)(this.electron.dependency, cmd, {
      cwd: this.$.env.paths.electronApp.root,
      env
    }); // TODO: check if we can configure piping in spawn options

    child.stdout.on('data', chunk => {
      process.stdout.write(chunk);
    });
    child.stderr.on('data', chunk => {
      process.stderr.write(chunk);
    });
  }

}

exports.default = Electron;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJFbGVjdHJvbiIsImNvbnN0cnVjdG9yIiwiJCIsImxvZyIsIkxvZyIsImluaXQiLCJlbGVjdHJvbiIsImdldERlcGVuZGVuY3kiLCJkZWZhdWx0RGVwZW5kZW5jaWVzIiwicnVuIiwiZW52IiwicHJvY2VzcyIsIkVMRUNUUk9OX0VOViIsImNtZCIsIm9wdGlvbnMiLCJkZWJ1ZyIsInB1c2giLCJjaGlsZCIsInNwYXduIiwiZGVwZW5kZW5jeSIsImN3ZCIsInBhdGhzIiwiZWxlY3Ryb25BcHAiLCJyb290Iiwic3Rkb3V0Iiwib24iLCJjaHVuayIsIndyaXRlIiwic3RkZXJyIl0sInNvdXJjZXMiOlsiLi4vbGliL2VsZWN0cm9uLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCByZWdlbmVyYXRvclJ1bnRpbWUgZnJvbSAncmVnZW5lcmF0b3ItcnVudGltZS9ydW50aW1lJztcbmltcG9ydCBzcGF3biBmcm9tICdjcm9zcy1zcGF3bic7XG5cbmltcG9ydCBMb2cgZnJvbSAnLi9sb2cnO1xuaW1wb3J0IGRlZmF1bHREZXBlbmRlbmNpZXMgZnJvbSAnLi9kZWZhdWx0RGVwZW5kZW5jaWVzJztcblxuLyoqXG4gKiBTaW1wbGUgRWxlY3Ryb24gcnVubmVyLiBSdW5zIHRoZSBwcm9qZWN0IHdpdGggdGhlIGJpbiBwcm92aWRlZCBieSB0aGUgJ2VsZWN0cm9uJyBwYWNrYWdlLlxuICogQGNsYXNzXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVsZWN0cm9uIHtcbiAgICBjb25zdHJ1Y3RvcigkKSB7XG4gICAgICAgIHRoaXMubG9nID0gbmV3IExvZygnZWxlY3Ryb24nKTtcbiAgICAgICAgdGhpcy4kID0gJDtcbiAgICB9XG5cbiAgICBhc3luYyBpbml0KCkge1xuICAgICAgICB0aGlzLmVsZWN0cm9uID0gYXdhaXQgdGhpcy4kLmdldERlcGVuZGVuY3koJ2VsZWN0cm9uJywgZGVmYXVsdERlcGVuZGVuY2llcy5lbGVjdHJvbik7XG4gICAgfVxuXG4gICAgcnVuKCkge1xuICAgICAgICAvLyBVbnRpbDogaHR0cHM6Ly9naXRodWIuY29tL2VsZWN0cm9uLXVzZXJsYW5kL2VsZWN0cm9uLXByZWJ1aWx0L3B1bGwvMTE4XG4gICAgICAgIGNvbnN0IHsgZW52IH0gPSBwcm9jZXNzO1xuICAgICAgICBlbnYuRUxFQ1RST05fRU5WID0gJ2RldmVsb3BtZW50JztcblxuICAgICAgICBjb25zdCBjbWQgPSBbXTtcblxuICAgICAgICBpZiAodGhpcy4kLmVudi5vcHRpb25zLmRlYnVnKSB7XG4gICAgICAgICAgICBjbWQucHVzaCgnLS1kZWJ1Zz01ODU4Jyk7XG4gICAgICAgIH1cblxuICAgICAgICBjbWQucHVzaCgnLicpO1xuXG4gICAgICAgIGNvbnN0IGNoaWxkID0gc3Bhd24odGhpcy5lbGVjdHJvbi5kZXBlbmRlbmN5LCBjbWQsIHtcbiAgICAgICAgICAgIGN3ZDogdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5yb290LFxuICAgICAgICAgICAgZW52XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRPRE86IGNoZWNrIGlmIHdlIGNhbiBjb25maWd1cmUgcGlwaW5nIGluIHNwYXduIG9wdGlvbnNcbiAgICAgICAgY2hpbGQuc3Rkb3V0Lm9uKCdkYXRhJywgKGNodW5rKSA9PiB7XG4gICAgICAgICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjaHVuayk7XG4gICAgICAgIH0pO1xuICAgICAgICBjaGlsZC5zdGRlcnIub24oJ2RhdGEnLCAoY2h1bmspID0+IHtcbiAgICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGNodW5rKTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBRUE7O0FBQ0E7Ozs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNlLE1BQU1BLFFBQU4sQ0FBZTtFQUMxQkMsV0FBVyxDQUFDQyxDQUFELEVBQUk7SUFDWCxLQUFLQyxHQUFMLEdBQVcsSUFBSUMsWUFBSixDQUFRLFVBQVIsQ0FBWDtJQUNBLEtBQUtGLENBQUwsR0FBU0EsQ0FBVDtFQUNIOztFQUVTLE1BQUpHLElBQUksR0FBRztJQUNULEtBQUtDLFFBQUwsR0FBZ0IsTUFBTSxLQUFLSixDQUFMLENBQU9LLGFBQVAsQ0FBcUIsVUFBckIsRUFBaUNDLDRCQUFBLENBQW9CRixRQUFyRCxDQUF0QjtFQUNIOztFQUVERyxHQUFHLEdBQUc7SUFDRjtJQUNBLE1BQU07TUFBRUM7SUFBRixJQUFVQyxPQUFoQjtJQUNBRCxHQUFHLENBQUNFLFlBQUosR0FBbUIsYUFBbkI7SUFFQSxNQUFNQyxHQUFHLEdBQUcsRUFBWjs7SUFFQSxJQUFJLEtBQUtYLENBQUwsQ0FBT1EsR0FBUCxDQUFXSSxPQUFYLENBQW1CQyxLQUF2QixFQUE4QjtNQUMxQkYsR0FBRyxDQUFDRyxJQUFKLENBQVMsY0FBVDtJQUNIOztJQUVESCxHQUFHLENBQUNHLElBQUosQ0FBUyxHQUFUO0lBRUEsTUFBTUMsS0FBSyxHQUFHLElBQUFDLG1CQUFBLEVBQU0sS0FBS1osUUFBTCxDQUFjYSxVQUFwQixFQUFnQ04sR0FBaEMsRUFBcUM7TUFDL0NPLEdBQUcsRUFBRSxLQUFLbEIsQ0FBTCxDQUFPUSxHQUFQLENBQVdXLEtBQVgsQ0FBaUJDLFdBQWpCLENBQTZCQyxJQURhO01BRS9DYjtJQUYrQyxDQUFyQyxDQUFkLENBYkUsQ0FrQkY7O0lBQ0FPLEtBQUssQ0FBQ08sTUFBTixDQUFhQyxFQUFiLENBQWdCLE1BQWhCLEVBQXlCQyxLQUFELElBQVc7TUFDL0JmLE9BQU8sQ0FBQ2EsTUFBUixDQUFlRyxLQUFmLENBQXFCRCxLQUFyQjtJQUNILENBRkQ7SUFHQVQsS0FBSyxDQUFDVyxNQUFOLENBQWFILEVBQWIsQ0FBZ0IsTUFBaEIsRUFBeUJDLEtBQUQsSUFBVztNQUMvQmYsT0FBTyxDQUFDaUIsTUFBUixDQUFlRCxLQUFmLENBQXFCRCxLQUFyQjtJQUNILENBRkQ7RUFHSDs7QUFuQ3lCIn0=