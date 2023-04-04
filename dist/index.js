"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _exports;

var _runtime = _interopRequireDefault(require("regenerator-runtime/runtime"));

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _shelljs = _interopRequireDefault(require("shelljs"));

var _env = _interopRequireDefault(require("./env"));

var _electron = _interopRequireDefault(require("./electron"));

var _log = _interopRequireDefault(require("./log"));

var _desktop = _interopRequireDefault(require("./desktop"));

var _electronApp = _interopRequireDefault(require("./electronApp"));

var _meteorApp = _interopRequireDefault(require("./meteorApp"));

var _electronBuilder = _interopRequireDefault(require("./electronBuilder"));

var _packager = _interopRequireDefault(require("./packager"));

var _utils = _interopRequireDefault(require("./utils"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// eslint-disable-next-line no-unused-vars
_shelljs.default.config.fatal = true;
/**
 * Main entity.
 * @class
 * @property {Env} env
 * @property {Electron} electron
 * @property {InstallerBuilder} installerBuilder
 * @property {ElectronApp} electronApp
 * @property {Desktop} desktop
 * @property {MeteorApp} meteorApp
 */

class MeteorDesktop {
  /**
   * @param {string} input        - Meteor app dir
   * @param {string} output       - output dir for bundle/package/installer
   * @param {Object} options      - options from cli.js
   * @param {Object} dependencies - dependencies object
   * @constructor
   */
  constructor(input, output, options, dependencies) {
    const Log = dependencies.log;
    this.log = new Log('index');
    this.version = this.getVersion();
    this.log.info('initializing');
    this.env = new _env.default(input, output, options);
    this.electron = new _electron.default(this);
    this.electronBuilder = new _electronBuilder.default(this);
    this.electronApp = new _electronApp.default(this);
    this.desktop = new _desktop.default(this);
    this.meteorApp = new _meteorApp.default(this);
    this.utils = _utils.default;
  }
  /**
   * Tries to read the version from our own package.json.
   *
   * @returns {string}
   */


  getVersion() {
    if (this.version) {
      return this.version;
    }

    let version = null;

    try {
      ({
        version
      } = JSON.parse(_fs.default.readFileSync(_path.default.join(__dirname, '..', 'package.json'), 'UTF-8')));
    } catch (e) {
      this.log.error(`error while trying to read ${_path.default.join(__dirname, 'package.json')}`, e);
      process.exit(1);
    }

    if (process.env.PLUGIN_VERSION && (version.includes('rc') || version.includes('beta') || version.includes('alpha'))) {
      version = process.env.PLUGIN_VERSION;
    }

    return version;
  }
  /**
   * Tries to read the version from our own package.json.
   *
   * @returns {string}
   */


  getElectronVersion() {
    let version = null;

    try {
      const {
        dependencies = {},
        devDependencies = {}
      } = JSON.parse(_fs.default.readFileSync(_path.default.join(this.env.paths.meteorApp.root, 'package.json'), 'UTF-8'));

      if (!('electron' in dependencies) && !('electron' in devDependencies)) {
        this.log.error('electron not found in meteor project dependencies');
        process.exit(1);
      }

      version = dependencies.electron || devDependencies.electron;

      if (this.electronApp.depsManager.checks.version.regex.test(version)) {
        ({
          version
        } = JSON.parse(_fs.default.readFileSync(_path.default.join(this.env.paths.meteorApp.root, 'node_modules', 'electron', 'package.json'), 'UTF-8')));
      }
    } catch (e) {
      this.log.error(`error while trying to read ${_path.default.join(this.env.paths.meteorApp.root, 'package.json')}`, e);
      process.exit(1);
    }

    return version;
  }

  async init() {
    this.desktop.scaffold();
    this.meteorApp.updateGitIgnore();
    await this.electronApp.init();
  }

  async buildInstaller(throwError = false) {
    this.env.options.installerBuild = true;
    await this.electronApp.build();

    try {
      await this.electronBuilder.build();
    } catch (e) {
      this.log.error('error occurred while building installer', e);

      if (throwError) {
        throw new Error(e);
      }
    }
  }

  async run() {
    await this.electronApp.build(true);
  }

  async build() {
    await this.electronApp.build();
  }

  justRun() {
    this.electron.run();
  }

  async runPackager() {
    this.packager = new _packager.default(this);
    await this.packager.init();
    await this.electronApp.build();
    this.packager.packageApp().catch(e => {
      this.log.error(`while trying to build a package an error occurred: ${e}`);
    });
  }

  async getDependency(name, version, declarationCheck = true) {
    if (declarationCheck) {
      try {
        const {
          dependencies = {},
          devDependencies = {}
        } = JSON.parse(_fs.default.readFileSync(_path.default.join(this.env.paths.meteorApp.root, 'package.json'), 'UTF-8'));

        if (!(name in dependencies) && !(name in devDependencies)) {
          await this.meteorApp.runNpm(['i', '-D', '-E', '--only=dev', `${name}@${version}`], 'inherit');
        }
      } catch (e) {
        this.log.error(`could no read ${_path.default.join(this.env.paths.meteorApp.root, 'package.json')}`, e);
        process.exit(1);
      }
    }

    const dependencyPath = _path.default.join(this.env.paths.meteorApp.root, 'node_modules', name);

    let dependency = null;

    try {
      dependency = require(dependencyPath);
    } catch (e) {
      if (declarationCheck) {
        this.log.warn(`could not find ${name}, installing the default version for you: ${name}@${version}`);

        try {
          await this.meteorApp.runNpm(['i', '-D', '-E', '--only=dev', `${name}@${version}`], 'inherit');
        } catch (err) {
          this.log.error(err);
          process.exit(1);
        }
      } else {
        this.log.warn(`could not find ${name}, exiting`);
        process.exit(1);
      }
    } finally {
      if (!dependency) {
        dependency = require(dependencyPath);
      }
    }

    const dependencyVersion = require(_path.default.join(dependencyPath, 'package.json')).version;

    if (dependencyVersion !== version) {
      if (dependencyVersion.split('.')[0] !== version.split('.')[0]) {
        this.log.warn(`you are using a ${name}@${dependencyVersion} while the recommended version is ` + `${version}, the compatibility version is different, use at your own risk, be sure to report ` + 'that when submitting issues');
      } else {
        this.log.warn(`you are using a ${name}@${dependencyVersion} while the recommended version is ` + `${version}, be sure to report that when submitting issues`);
      }
    }

    return {
      dependency,
      path: dependencyPath
    };
  }

}

function _exports(input, output, options, {
  log = _log.default
} = {
  log: _log.default
}) {
  return new MeteorDesktop(input, output, options, {
    log
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJzaGVsbCIsImNvbmZpZyIsImZhdGFsIiwiTWV0ZW9yRGVza3RvcCIsImNvbnN0cnVjdG9yIiwiaW5wdXQiLCJvdXRwdXQiLCJvcHRpb25zIiwiZGVwZW5kZW5jaWVzIiwiTG9nIiwibG9nIiwidmVyc2lvbiIsImdldFZlcnNpb24iLCJpbmZvIiwiZW52IiwiRW52IiwiZWxlY3Ryb24iLCJFbGVjdHJvbiIsImVsZWN0cm9uQnVpbGRlciIsIkVsZWN0cm9uQnVpbGRlciIsImVsZWN0cm9uQXBwIiwiRWxlY3Ryb25BcHAiLCJkZXNrdG9wIiwiRGVza3RvcCIsIm1ldGVvckFwcCIsIk1ldGVvckFwcCIsInV0aWxzIiwiSlNPTiIsInBhcnNlIiwiZnMiLCJyZWFkRmlsZVN5bmMiLCJwYXRoIiwiam9pbiIsIl9fZGlybmFtZSIsImUiLCJlcnJvciIsInByb2Nlc3MiLCJleGl0IiwiUExVR0lOX1ZFUlNJT04iLCJpbmNsdWRlcyIsImdldEVsZWN0cm9uVmVyc2lvbiIsImRldkRlcGVuZGVuY2llcyIsInBhdGhzIiwicm9vdCIsImRlcHNNYW5hZ2VyIiwiY2hlY2tzIiwicmVnZXgiLCJ0ZXN0IiwiaW5pdCIsInNjYWZmb2xkIiwidXBkYXRlR2l0SWdub3JlIiwiYnVpbGRJbnN0YWxsZXIiLCJ0aHJvd0Vycm9yIiwiaW5zdGFsbGVyQnVpbGQiLCJidWlsZCIsIkVycm9yIiwicnVuIiwianVzdFJ1biIsInJ1blBhY2thZ2VyIiwicGFja2FnZXIiLCJQYWNrYWdlciIsInBhY2thZ2VBcHAiLCJjYXRjaCIsImdldERlcGVuZGVuY3kiLCJuYW1lIiwiZGVjbGFyYXRpb25DaGVjayIsInJ1bk5wbSIsImRlcGVuZGVuY3lQYXRoIiwiZGVwZW5kZW5jeSIsInJlcXVpcmUiLCJ3YXJuIiwiZXJyIiwiZGVwZW5kZW5jeVZlcnNpb24iLCJzcGxpdCIsImV4cG9ydHMiLCJMb2dnZXIiXSwic291cmNlcyI6WyIuLi9saWIvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXVudXNlZC12YXJzXG5pbXBvcnQgcmVnZW5lcmF0b3JSdW50aW1lIGZyb20gJ3JlZ2VuZXJhdG9yLXJ1bnRpbWUvcnVudGltZSc7XG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgc2hlbGwgZnJvbSAnc2hlbGxqcyc7XG5pbXBvcnQgRW52IGZyb20gJy4vZW52JztcbmltcG9ydCBFbGVjdHJvbiBmcm9tICcuL2VsZWN0cm9uJztcbmltcG9ydCBMb2dnZXIgZnJvbSAnLi9sb2cnO1xuaW1wb3J0IERlc2t0b3AgZnJvbSAnLi9kZXNrdG9wJztcbmltcG9ydCBFbGVjdHJvbkFwcCBmcm9tICcuL2VsZWN0cm9uQXBwJztcbmltcG9ydCBNZXRlb3JBcHAgZnJvbSAnLi9tZXRlb3JBcHAnO1xuaW1wb3J0IEVsZWN0cm9uQnVpbGRlciBmcm9tICcuL2VsZWN0cm9uQnVpbGRlcic7XG5pbXBvcnQgUGFja2FnZXIgZnJvbSAnLi9wYWNrYWdlcic7XG5pbXBvcnQgdXRpbHMgZnJvbSAnLi91dGlscyc7XG5cbnNoZWxsLmNvbmZpZy5mYXRhbCA9IHRydWU7XG5cbi8qKlxuICogTWFpbiBlbnRpdHkuXG4gKiBAY2xhc3NcbiAqIEBwcm9wZXJ0eSB7RW52fSBlbnZcbiAqIEBwcm9wZXJ0eSB7RWxlY3Ryb259IGVsZWN0cm9uXG4gKiBAcHJvcGVydHkge0luc3RhbGxlckJ1aWxkZXJ9IGluc3RhbGxlckJ1aWxkZXJcbiAqIEBwcm9wZXJ0eSB7RWxlY3Ryb25BcHB9IGVsZWN0cm9uQXBwXG4gKiBAcHJvcGVydHkge0Rlc2t0b3B9IGRlc2t0b3BcbiAqIEBwcm9wZXJ0eSB7TWV0ZW9yQXBwfSBtZXRlb3JBcHBcbiAqL1xuY2xhc3MgTWV0ZW9yRGVza3RvcCB7XG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGlucHV0ICAgICAgICAtIE1ldGVvciBhcHAgZGlyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG91dHB1dCAgICAgICAtIG91dHB1dCBkaXIgZm9yIGJ1bmRsZS9wYWNrYWdlL2luc3RhbGxlclxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zICAgICAgLSBvcHRpb25zIGZyb20gY2xpLmpzXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGRlcGVuZGVuY2llcyAtIGRlcGVuZGVuY2llcyBvYmplY3RcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihpbnB1dCwgb3V0cHV0LCBvcHRpb25zLCBkZXBlbmRlbmNpZXMpIHtcbiAgICAgICAgY29uc3QgTG9nID0gZGVwZW5kZW5jaWVzLmxvZztcbiAgICAgICAgdGhpcy5sb2cgPSBuZXcgTG9nKCdpbmRleCcpO1xuICAgICAgICB0aGlzLnZlcnNpb24gPSB0aGlzLmdldFZlcnNpb24oKTtcblxuICAgICAgICB0aGlzLmxvZy5pbmZvKCdpbml0aWFsaXppbmcnKTtcblxuICAgICAgICB0aGlzLmVudiA9IG5ldyBFbnYoaW5wdXQsIG91dHB1dCwgb3B0aW9ucyk7XG4gICAgICAgIHRoaXMuZWxlY3Ryb24gPSBuZXcgRWxlY3Ryb24odGhpcyk7XG4gICAgICAgIHRoaXMuZWxlY3Ryb25CdWlsZGVyID0gbmV3IEVsZWN0cm9uQnVpbGRlcih0aGlzKTtcbiAgICAgICAgdGhpcy5lbGVjdHJvbkFwcCA9IG5ldyBFbGVjdHJvbkFwcCh0aGlzKTtcbiAgICAgICAgdGhpcy5kZXNrdG9wID0gbmV3IERlc2t0b3AodGhpcyk7XG4gICAgICAgIHRoaXMubWV0ZW9yQXBwID0gbmV3IE1ldGVvckFwcCh0aGlzKTtcbiAgICAgICAgdGhpcy51dGlscyA9IHV0aWxzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyaWVzIHRvIHJlYWQgdGhlIHZlcnNpb24gZnJvbSBvdXIgb3duIHBhY2thZ2UuanNvbi5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICovXG4gICAgZ2V0VmVyc2lvbigpIHtcbiAgICAgICAgaWYgKHRoaXMudmVyc2lvbikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMudmVyc2lvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB2ZXJzaW9uID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICh7IHZlcnNpb24gfSA9IEpTT04ucGFyc2UoXG4gICAgICAgICAgICAgICAgZnMucmVhZEZpbGVTeW5jKHBhdGguam9pbihfX2Rpcm5hbWUsICcuLicsICdwYWNrYWdlLmpzb24nKSwgJ1VURi04JylcbiAgICAgICAgICAgICkpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcihgZXJyb3Igd2hpbGUgdHJ5aW5nIHRvIHJlYWQgJHtwYXRoLmpvaW4oX19kaXJuYW1lLCAncGFja2FnZS5qc29uJyl9YCwgZSk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHByb2Nlc3MuZW52LlBMVUdJTl9WRVJTSU9OICYmXG4gICAgICAgICAgICAodmVyc2lvbi5pbmNsdWRlcygncmMnKSB8fCB2ZXJzaW9uLmluY2x1ZGVzKCdiZXRhJykgfHwgdmVyc2lvbi5pbmNsdWRlcygnYWxwaGEnKSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgICB2ZXJzaW9uID0gcHJvY2Vzcy5lbnYuUExVR0lOX1ZFUlNJT047XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZlcnNpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZXMgdG8gcmVhZCB0aGUgdmVyc2lvbiBmcm9tIG91ciBvd24gcGFja2FnZS5qc29uLlxuICAgICAqXG4gICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAgKi9cbiAgICBnZXRFbGVjdHJvblZlcnNpb24oKSB7XG4gICAgICAgIGxldCB2ZXJzaW9uID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGVwZW5kZW5jaWVzID0ge30sIGRldkRlcGVuZGVuY2llcyA9IHt9IH0gPSBKU09OLnBhcnNlKFxuICAgICAgICAgICAgICAgIGZzLnJlYWRGaWxlU3luYyhwYXRoLmpvaW4odGhpcy5lbnYucGF0aHMubWV0ZW9yQXBwLnJvb3QsICdwYWNrYWdlLmpzb24nKSwgJ1VURi04JylcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoISgnZWxlY3Ryb24nIGluIGRlcGVuZGVuY2llcykgJiYgISgnZWxlY3Ryb24nIGluIGRldkRlcGVuZGVuY2llcykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZWxlY3Ryb24gbm90IGZvdW5kIGluIG1ldGVvciBwcm9qZWN0IGRlcGVuZGVuY2llcycpO1xuICAgICAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZlcnNpb24gPSBkZXBlbmRlbmNpZXMuZWxlY3Ryb24gfHwgZGV2RGVwZW5kZW5jaWVzLmVsZWN0cm9uO1xuICAgICAgICAgICAgaWYgKHRoaXMuZWxlY3Ryb25BcHAuZGVwc01hbmFnZXIuY2hlY2tzLnZlcnNpb24ucmVnZXgudGVzdCh2ZXJzaW9uKSkge1xuICAgICAgICAgICAgICAgICh7IHZlcnNpb24gfSA9IEpTT04ucGFyc2UoXG4gICAgICAgICAgICAgICAgICAgIGZzLnJlYWRGaWxlU3luYyhwYXRoLmpvaW4odGhpcy5lbnYucGF0aHMubWV0ZW9yQXBwLnJvb3QsICdub2RlX21vZHVsZXMnLCAnZWxlY3Ryb24nLCAncGFja2FnZS5qc29uJyksICdVVEYtOCcpXG4gICAgICAgICAgICAgICAgKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKGBlcnJvciB3aGlsZSB0cnlpbmcgdG8gcmVhZCAke3BhdGguam9pbih0aGlzLmVudi5wYXRocy5tZXRlb3JBcHAucm9vdCwgJ3BhY2thZ2UuanNvbicpfWAsIGUpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2ZXJzaW9uO1xuICAgIH1cblxuICAgIGFzeW5jIGluaXQoKSB7XG4gICAgICAgIHRoaXMuZGVza3RvcC5zY2FmZm9sZCgpO1xuICAgICAgICB0aGlzLm1ldGVvckFwcC51cGRhdGVHaXRJZ25vcmUoKTtcbiAgICAgICAgYXdhaXQgdGhpcy5lbGVjdHJvbkFwcC5pbml0KCk7XG4gICAgfVxuXG4gICAgYXN5bmMgYnVpbGRJbnN0YWxsZXIodGhyb3dFcnJvciA9IGZhbHNlKSB7XG4gICAgICAgIHRoaXMuZW52Lm9wdGlvbnMuaW5zdGFsbGVyQnVpbGQgPSB0cnVlO1xuICAgICAgICBhd2FpdCB0aGlzLmVsZWN0cm9uQXBwLmJ1aWxkKCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmVsZWN0cm9uQnVpbGRlci5idWlsZCgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igb2NjdXJyZWQgd2hpbGUgYnVpbGRpbmcgaW5zdGFsbGVyJywgZSk7XG4gICAgICAgICAgICBpZiAodGhyb3dFcnJvcikge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIHJ1bigpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5lbGVjdHJvbkFwcC5idWlsZCh0cnVlKTtcbiAgICB9XG5cbiAgICBhc3luYyBidWlsZCgpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5lbGVjdHJvbkFwcC5idWlsZCgpO1xuICAgIH1cblxuICAgIGp1c3RSdW4oKSB7XG4gICAgICAgIHRoaXMuZWxlY3Ryb24ucnVuKCk7XG4gICAgfVxuXG4gICAgYXN5bmMgcnVuUGFja2FnZXIoKSB7XG4gICAgICAgIHRoaXMucGFja2FnZXIgPSBuZXcgUGFja2FnZXIodGhpcyk7XG4gICAgICAgIGF3YWl0IHRoaXMucGFja2FnZXIuaW5pdCgpO1xuICAgICAgICBhd2FpdCB0aGlzLmVsZWN0cm9uQXBwLmJ1aWxkKCk7XG5cbiAgICAgICAgdGhpcy5wYWNrYWdlci5wYWNrYWdlQXBwKCkuY2F0Y2goKGUpID0+IHtcbiAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKGB3aGlsZSB0cnlpbmcgdG8gYnVpbGQgYSBwYWNrYWdlIGFuIGVycm9yIG9jY3VycmVkOiAke2V9YCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIGdldERlcGVuZGVuY3kobmFtZSwgdmVyc2lvbiwgZGVjbGFyYXRpb25DaGVjayA9IHRydWUpIHtcbiAgICAgICAgaWYgKGRlY2xhcmF0aW9uQ2hlY2spIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgeyBkZXBlbmRlbmNpZXMgPSB7fSwgZGV2RGVwZW5kZW5jaWVzID0ge30gfSA9IEpTT04ucGFyc2UoXG4gICAgICAgICAgICAgICAgICAgIGZzLnJlYWRGaWxlU3luYyhwYXRoLmpvaW4odGhpcy5lbnYucGF0aHMubWV0ZW9yQXBwLnJvb3QsICdwYWNrYWdlLmpzb24nKSwgJ1VURi04JylcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmICghKG5hbWUgaW4gZGVwZW5kZW5jaWVzKSAmJiAhKG5hbWUgaW4gZGV2RGVwZW5kZW5jaWVzKSkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLm1ldGVvckFwcC5ydW5OcG0oWydpJywgJy1EJywgJy1FJywgJy0tb25seT1kZXYnLCBgJHtuYW1lfUAke3ZlcnNpb259YF0sICdpbmhlcml0Jyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKGBjb3VsZCBubyByZWFkICR7cGF0aC5qb2luKHRoaXMuZW52LnBhdGhzLm1ldGVvckFwcC5yb290LCAncGFja2FnZS5qc29uJyl9YCwgZSk7XG4gICAgICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZGVwZW5kZW5jeVBhdGggPSBwYXRoLmpvaW4odGhpcy5lbnYucGF0aHMubWV0ZW9yQXBwLnJvb3QsICdub2RlX21vZHVsZXMnLCBuYW1lKTtcbiAgICAgICAgbGV0IGRlcGVuZGVuY3kgPSBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZGVwZW5kZW5jeSA9IHJlcXVpcmUoZGVwZW5kZW5jeVBhdGgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBpZiAoZGVjbGFyYXRpb25DaGVjaykge1xuICAgICAgICAgICAgICAgIHRoaXMubG9nLndhcm4oYGNvdWxkIG5vdCBmaW5kICR7bmFtZX0sIGluc3RhbGxpbmcgdGhlIGRlZmF1bHQgdmVyc2lvbiBmb3IgeW91OiAke25hbWV9QCR7dmVyc2lvbn1gKTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLm1ldGVvckFwcC5ydW5OcG0oWydpJywgJy1EJywgJy1FJywgJy0tb25seT1kZXYnLCBgJHtuYW1lfUAke3ZlcnNpb259YF0sICdpbmhlcml0Jyk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKGVycik7XG4gICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMubG9nLndhcm4oYGNvdWxkIG5vdCBmaW5kICR7bmFtZX0sIGV4aXRpbmdgKTtcbiAgICAgICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBpZiAoIWRlcGVuZGVuY3kpIHtcbiAgICAgICAgICAgICAgICBkZXBlbmRlbmN5ID0gcmVxdWlyZShkZXBlbmRlbmN5UGF0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGVwZW5kZW5jeVZlcnNpb24gPSByZXF1aXJlKHBhdGguam9pbihkZXBlbmRlbmN5UGF0aCwgJ3BhY2thZ2UuanNvbicpKS52ZXJzaW9uO1xuXG4gICAgICAgIGlmIChkZXBlbmRlbmN5VmVyc2lvbiAhPT0gdmVyc2lvbikge1xuICAgICAgICAgICAgaWYgKGRlcGVuZGVuY3lWZXJzaW9uLnNwbGl0KCcuJylbMF0gIT09IHZlcnNpb24uc3BsaXQoJy4nKVswXSkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9nLndhcm4oYHlvdSBhcmUgdXNpbmcgYSAke25hbWV9QCR7ZGVwZW5kZW5jeVZlcnNpb259IHdoaWxlIHRoZSByZWNvbW1lbmRlZCB2ZXJzaW9uIGlzIGAgK1xuICAgICAgICAgICAgICAgICAgICBgJHt2ZXJzaW9ufSwgdGhlIGNvbXBhdGliaWxpdHkgdmVyc2lvbiBpcyBkaWZmZXJlbnQsIHVzZSBhdCB5b3VyIG93biByaXNrLCBiZSBzdXJlIHRvIHJlcG9ydCBgICtcbiAgICAgICAgICAgICAgICAgICAgJ3RoYXQgd2hlbiBzdWJtaXR0aW5nIGlzc3VlcycpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy53YXJuKGB5b3UgYXJlIHVzaW5nIGEgJHtuYW1lfUAke2RlcGVuZGVuY3lWZXJzaW9ufSB3aGlsZSB0aGUgcmVjb21tZW5kZWQgdmVyc2lvbiBpcyBgICtcbiAgICAgICAgICAgICAgICAgICAgYCR7dmVyc2lvbn0sIGJlIHN1cmUgdG8gcmVwb3J0IHRoYXQgd2hlbiBzdWJtaXR0aW5nIGlzc3Vlc2ApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IGRlcGVuZGVuY3ksIHBhdGg6IGRlcGVuZGVuY3lQYXRoIH07XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBleHBvcnRzKGlucHV0LCBvdXRwdXQsIG9wdGlvbnMsIHsgbG9nID0gTG9nZ2VyIH0gPSB7IGxvZzogTG9nZ2VyIH0pIHtcbiAgICByZXR1cm4gbmV3IE1ldGVvckRlc2t0b3AoaW5wdXQsIG91dHB1dCwgb3B0aW9ucywgeyBsb2cgfSk7XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQWJBO0FBZUFBLGdCQUFBLENBQU1DLE1BQU4sQ0FBYUMsS0FBYixHQUFxQixJQUFyQjtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUNBLE1BQU1DLGFBQU4sQ0FBb0I7RUFDaEI7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSUMsV0FBVyxDQUFDQyxLQUFELEVBQVFDLE1BQVIsRUFBZ0JDLE9BQWhCLEVBQXlCQyxZQUF6QixFQUF1QztJQUM5QyxNQUFNQyxHQUFHLEdBQUdELFlBQVksQ0FBQ0UsR0FBekI7SUFDQSxLQUFLQSxHQUFMLEdBQVcsSUFBSUQsR0FBSixDQUFRLE9BQVIsQ0FBWDtJQUNBLEtBQUtFLE9BQUwsR0FBZSxLQUFLQyxVQUFMLEVBQWY7SUFFQSxLQUFLRixHQUFMLENBQVNHLElBQVQsQ0FBYyxjQUFkO0lBRUEsS0FBS0MsR0FBTCxHQUFXLElBQUlDLFlBQUosQ0FBUVYsS0FBUixFQUFlQyxNQUFmLEVBQXVCQyxPQUF2QixDQUFYO0lBQ0EsS0FBS1MsUUFBTCxHQUFnQixJQUFJQyxpQkFBSixDQUFhLElBQWIsQ0FBaEI7SUFDQSxLQUFLQyxlQUFMLEdBQXVCLElBQUlDLHdCQUFKLENBQW9CLElBQXBCLENBQXZCO0lBQ0EsS0FBS0MsV0FBTCxHQUFtQixJQUFJQyxvQkFBSixDQUFnQixJQUFoQixDQUFuQjtJQUNBLEtBQUtDLE9BQUwsR0FBZSxJQUFJQyxnQkFBSixDQUFZ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