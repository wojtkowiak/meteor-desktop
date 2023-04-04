"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _runtime = _interopRequireDefault(require("regenerator-runtime/runtime"));

var _shelljs = _interopRequireDefault(require("shelljs"));

var _path = _interopRequireDefault(require("path"));

var _fs = _interopRequireDefault(require("fs"));

var _rimraf = _interopRequireDefault(require("rimraf"));

var _crossSpawn = _interopRequireDefault(require("cross-spawn"));

var _log = _interopRequireDefault(require("./log"));

var _defaultDependencies = _interopRequireDefault(require("./defaultDependencies"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// eslint-disable-next-line no-unused-vars

/**
 * Promisfied rimraf.
 *
 * @param {string} dirPath - path to the dir to be deleted
 * @param {number} delay - delay the task by ms
 * @returns {Promise<any>}
 */
function removeDir(dirPath, delay = 0) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      (0, _rimraf.default)(dirPath, {
        maxBusyTries: 100
      }, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    }, delay);
  });
}
/**
 * Wrapper for electron-builder.
 */


class InstallerBuilder {
  /**
   * @param {MeteorDesktop} $ - context
   *
   * @constructor
   */
  constructor($) {
    this.log = new _log.default('electronBuilder');
    this.$ = $;
    this.firstPass = true;
    this.lastRebuild = {};
    this.currentContext = null;
    this.installerDir = _path.default.join(this.$.env.options.output, this.$.env.paths.installerDir);
    this.platforms = [];
  }

  async init() {
    this.builder = await this.$.getDependency('electron-builder', _defaultDependencies.default['electron-builder']);
    const appBuilder = await this.$.getDependency('app-builder-lib', _defaultDependencies.default['electron-builder'], false);
    this.yarn = require(_path.default.join(appBuilder.path, 'out', 'util', 'yarn'));
    this.getGypEnv = this.yarn.getGypEnv;
    this.packageDependencies = require(_path.default.join(appBuilder.path, 'out', 'util', 'packageDependencies'));
  }
  /**
   * Prepares the last rebuild object for electron-builder.
   *
   * @param {string} arch
   * @param {string} platform
   * @returns {Object}
   */


  prepareLastRebuildObject(arch, platform = process.platform) {
    const productionDeps = this.packageDependencies.createLazyProductionDeps(this.$.env.paths.electronApp.root);
    this.lastRebuild = {
      frameworkInfo: {
        version: this.$.getElectronVersion(),
        useCustomDist: true
      },
      platform,
      arch,
      productionDeps
    };
    return this.lastRebuild;
  }
  /**
   * Calls npm rebuild from electron-builder.
   * @param {string} arch
   * @param {string} platform
   * @param {boolean} install
   * @returns {Promise}
   */


  async installOrRebuild(arch, platform = process.platform, install = false) {
    this.log.debug(`calling installOrRebuild from electron-builder for arch ${arch}`);
    this.prepareLastRebuildObject(arch, platform);
    await this.yarn.installOrRebuild(this.$.desktop.getSettings().builderOptions || {}, this.$.env.paths.electronApp.root, this.lastRebuild, install);
  }
  /**
   * Callback invoked before build is made. Ensures that app.asar have the right rebuilt
   * node_modules.
   *
   * @param {Object} context
   * @returns {Promise}
   */


  beforeBuild(context) {
    this.currentContext = Object.assign({}, context);
    return new Promise((resolve, reject) => {
      const platformMatches = process.platform === context.platform.nodeName;
      const rebuild = platformMatches && context.arch !== this.lastRebuild.arch;

      if (!platformMatches) {
        this.log.warn('skipping dependencies rebuild because platform is different, if you have native ' + 'node modules as your app dependencies you should od the build on the target platform only');
      }

      if (!rebuild) {
        this.moveNodeModulesOut().catch(e => reject(e)).then(() => setTimeout(() => resolve(false), 2000)); // Timeout helps on Windows to clear the file locks.
      } else {
        // Lets rebuild the node_modules for different arch.
        this.installOrRebuild(context.arch, context.platform.nodeName).catch(e => reject(e)).then(() => this.$.electronApp.installLocalNodeModules(context.arch)).catch(e => reject(e)).then(() => {
          this.$.electronApp.scaffold.createAppRoot();
          this.$.electronApp.scaffold.copySkeletonApp();
          return this.$.electronApp.packSkeletonToAsar([this.$.env.paths.electronApp.meteorAsar, this.$.env.paths.electronApp.desktopAsar, this.$.env.paths.electronApp.extracted]);
        }).catch(e => reject(e)).then(() => this.moveNodeModulesOut()).catch(e => reject(e)).then(() => resolve(false));
      }
    });
  }
  /**
   * Callback to be invoked after packing. Restores node_modules to the .desktop-build.
   * @returns {Promise}
   */


  afterPack(context) {
    this.platforms = this.platforms.filter(platform => platform !== context.electronPlatformName);

    if (this.platforms.length !== 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      _shelljs.default.config.fatal = true;

      if (this.$.utils.exists(this.$.env.paths.electronApp.extractedNodeModules)) {
        this.log.debug('injecting extracted modules');

        _shelljs.default.cp('-Rf', this.$.env.paths.electronApp.extractedNodeModules, _path.default.join(this.getPackagedAppPath(context), 'node_modules'));
      }

      this.log.debug('moving node_modules back'); // Move node_modules back.

      try {
        _shelljs.default.mv(this.$.env.paths.electronApp.tmpNodeModules, this.$.env.paths.electronApp.nodeModules);
      } catch (e) {
        reject(e);
        return;
      } finally {
        _shelljs.default.config.reset();
      }

      if (this.firstPass) {
        this.firstPass = false;
      }

      this.log.debug('node_modules moved back');
      this.wait().catch(e => reject(e)).then(() => resolve());
    });
  }
  /**
   * This command kills orphaned MSBuild.exe processes.
   * Sometime after native node_modules compilation they are still writing some logs,
   * prevent node_modules from being deleted.
   */


  killMSBuild() {
    if (this.currentContext.platform.nodeName !== 'win32') {
      return;
    }

    try {
      const out = _crossSpawn.default.sync('wmic', ['process', 'where', 'caption="MSBuild.exe"', 'get', 'processid']).stdout.toString('utf-8').split('\n');

      const regex = new RegExp(/(\d+)/, 'gm'); // No we will check for those with the matching params.

      out.forEach(line => {
        const match = regex.exec(line) || false;

        if (match) {
          this.log.debug(`killing MSBuild.exe at pid: ${match[1]}`);

          _crossSpawn.default.sync('taskkill', ['/pid', match[1], '/f', '/t']);
        }

        regex.lastIndex = 0;
      });
    } catch (e) {
      this.log.debug('kill MSBuild failed');
    }
  }
  /**
   * Returns the path to packaged app.
   * @returns {string}
   */


  getPackagedAppPath(context = {}) {
    if (this.currentContext.platform.nodeName === 'darwin') {
      return _path.default.join(this.installerDir, 'mac', `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'app');
    }

    const platformDir = `${this.currentContext.platform.nodeName === 'win32' ? 'win' : 'linux'}-${this.currentContext.arch === 'ia32' ? 'ia32-' : ''}unpacked`;
    return _path.default.join(this.installerDir, platformDir, 'resources', 'app');
  }
  /**
   * On Windows it waits for the app.asar in the packed app to be free (no file locks).
   * @returns {*}
   */


  wait() {
    if (this.currentContext.platform.nodeName !== 'win32') {
      return Promise.resolve();
    }

    const appAsarPath = _path.default.join(this.getPackagedAppPath(), 'app.asar');

    let retries = 0;
    const self = this;
    return new Promise((resolve, reject) => {
      function check() {
        _fs.default.open(appAsarPath, 'r+', (err, fd) => {
          retries += 1;

          if (err) {
            if (err.code !== 'ENOENT') {
              self.log.debug(`waiting for app.asar to be readable, ${'code' in err ? `currently reading it returns ${err.code}` : ''}`);

              if (retries < 6) {
                setTimeout(() => check(), 4000);
              } else {
                reject(`file is locked: ${appAsarPath}`);
              }
            } else {
              resolve();
            }
          } else {
            _fs.default.closeSync(fd);

            resolve();
          }
        });
      }

      check();
    });
  }
  /**
   * Prepares the target object passed to the electron-builder.
   *
   * @returns {Map<Platform, Map<Arch, Array<string>>>}
   */


  prepareTargets() {
    let arch = this.$.env.options.ia32 ? 'ia32' : 'x64';
    arch = this.$.env.options.allArchs ? 'all' : arch;
    const targets = [];

    if (this.$.env.options.win) {
      targets.push(this.builder.dependency.Platform.WINDOWS);
    }

    if (this.$.env.options.linux) {
      targets.push(this.builder.dependency.Platform.LINUX);
    }

    if (this.$.env.options.mac) {
      targets.push(this.builder.dependency.Platform.MAC);
    }

    if (targets.length === 0) {
      if (this.$.env.os.isWindows) {
        targets.push(this.builder.dependency.Platform.WINDOWS);
      } else if (this.$.env.os.isLinux) {
        targets.push(this.builder.dependency.Platform.LINUX);
      } else {
        targets.push(this.builder.dependency.Platform.MAC);
      }
    }

    return this.builder.dependency.createTargets(targets, null, arch);
  }

  async build() {
    const settings = this.$.desktop.getSettings();

    if (!('builderOptions' in settings)) {
      this.log.error('no builderOptions in settings.json, aborting');
      process.exit(1);
    }

    const builderOptions = Object.assign({}, settings.builderOptions);
    builderOptions.asar = false;
    builderOptions.npmRebuild = true;
    builderOptions.beforeBuild = this.beforeBuild.bind(this);
    builderOptions.afterPack = this.afterPack.bind(this);
    builderOptions.electronVersion = this.$.getElectronVersion();
    builderOptions.directories = {
      app: this.$.env.paths.electronApp.root,
      output: _path.default.join(this.$.env.options.output, this.$.env.paths.installerDir)
    };

    if ('mac' in builderOptions && 'target' in builderOptions.mac) {
      if (builderOptions.mac.target.includes('mas')) {
        this.platforms = ['darwin', 'mas'];
      }
    }

    try {
      this.log.debug('calling build from electron-builder');
      await this.builder.dependency.build(Object.assign({
        targets: this.prepareTargets(),
        config: builderOptions
      }, settings.builderCliOptions));

      if (this.$.utils.exists(this.$.env.paths.electronApp.extractedNodeModules)) {
        _shelljs.default.rm('-rf', this.$.env.paths.electronApp.extractedNodeModules);
      }
    } catch (e) {
      this.log.error('error while building installer: ', e);
    }
  }
  /**
   * Moves node_modules out of the app because while the app will be packaged
   * we do not want it to be there.
   * @returns {Promise<any>}
   */


  moveNodeModulesOut() {
    return new Promise((resolve, reject) => {
      this.log.debug('moving node_modules out, because we have them already in' + ' app.asar');
      this.killMSBuild();
      removeDir(this.$.env.paths.electronApp.tmpNodeModules).catch(e => reject(e)).then(() => {
        _shelljs.default.config.fatal = true;
        _shelljs.default.config.verbose = true;

        try {
          _shelljs.default.mv(this.$.env.paths.electronApp.nodeModules, this.$.env.paths.electronApp.tmpNodeModules);

          _shelljs.default.config.reset();

          return this.wait();
        } catch (e) {
          _shelljs.default.config.reset();

          return Promise.reject(e);
        }
      }).catch(e => reject(e)).then(() => removeDir(this.$.env.paths.electronApp.nodeModules, 1000)).catch(e => reject(e)).then(() => this.wait()).catch(reject).then(resolve);
    });
  }

}

exports.default = InstallerBuilder;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJyZW1vdmVEaXIiLCJkaXJQYXRoIiwiZGVsYXkiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsInNldFRpbWVvdXQiLCJyaW1yYWYiLCJtYXhCdXN5VHJpZXMiLCJlcnIiLCJJbnN0YWxsZXJCdWlsZGVyIiwiY29uc3RydWN0b3IiLCIkIiwibG9nIiwiTG9nIiwiZmlyc3RQYXNzIiwibGFzdFJlYnVpbGQiLCJjdXJyZW50Q29udGV4dCIsImluc3RhbGxlckRpciIsInBhdGgiLCJqb2luIiwiZW52Iiwib3B0aW9ucyIsIm91dHB1dCIsInBhdGhzIiwicGxhdGZvcm1zIiwiaW5pdCIsImJ1aWxkZXIiLCJnZXREZXBlbmRlbmN5IiwiZGVmYXVsdERlcGVuZGVuY2llcyIsImFwcEJ1aWxkZXIiLCJ5YXJuIiwicmVxdWlyZSIsImdldEd5cEVudiIsInBhY2thZ2VEZXBlbmRlbmNpZXMiLCJwcmVwYXJlTGFzdFJlYnVpbGRPYmplY3QiLCJhcmNoIiwicGxhdGZvcm0iLCJwcm9jZXNzIiwicHJvZHVjdGlvbkRlcHMiLCJjcmVhdGVMYXp5UHJvZHVjdGlvbkRlcHMiLCJlbGVjdHJvbkFwcCIsInJvb3QiLCJmcmFtZXdvcmtJbmZvIiwidmVyc2lvbiIsImdldEVsZWN0cm9uVmVyc2lvbiIsInVzZUN1c3RvbURpc3QiLCJpbnN0YWxsT3JSZWJ1aWxkIiwiaW5zdGFsbCIsImRlYnVnIiwiZGVza3RvcCIsImdldFNldHRpbmdzIiwiYnVpbGRlck9wdGlvbnMiLCJiZWZvcmVCdWlsZCIsImNvbnRleHQiLCJPYmplY3QiLCJhc3NpZ24iLCJwbGF0Zm9ybU1hdGNoZXMiLCJub2RlTmFtZSIsInJlYnVpbGQiLCJ3YXJuIiwibW92ZU5vZGVNb2R1bGVzT3V0IiwiY2F0Y2giLCJlIiwidGhlbiIsImluc3RhbGxMb2NhbE5vZGVNb2R1bGVzIiwic2NhZmZvbGQiLCJjcmVhdGVBcHBSb290IiwiY29weVNrZWxldG9uQXBwIiwicGFja1NrZWxldG9uVG9Bc2FyIiwibWV0ZW9yQXNhciIsImRlc2t0b3BBc2FyIiwiZXh0cmFjdGVkIiwiYWZ0ZXJQYWNrIiwiZmlsdGVyIiwiZWxlY3Ryb25QbGF0Zm9ybU5hbWUiLCJsZW5ndGgiLCJzaGVsbCIsImNvbmZpZyIsImZhdGFsIiwidXRpbHMiLCJleGlzdHMiLCJleHRyYWN0ZWROb2RlTW9kdWxlcyIsImNwIiwiZ2V0UGFja2FnZWRBcHBQYXRoIiwibXYiLCJ0bXBOb2RlTW9kdWxlcyIsIm5vZGVNb2R1bGVzIiwicmVzZXQiLCJ3YWl0Iiwia2lsbE1TQnVpbGQiLCJvdXQiLCJzcGF3biIsInN5bmMiLCJzdGRvdXQiLCJ0b1N0cmluZyIsInNwbGl0IiwicmVnZXgiLCJSZWdFeHAiLCJmb3JFYWNoIiwibGluZSIsIm1hdGNoIiwiZXhlYyIsImxhc3RJbmRleCIsInBhY2thZ2VyIiwiYXBwSW5mbyIsInByb2R1Y3RGaWxlbmFtZSIsInBsYXRmb3JtRGlyIiwiYXBwQXNhclBhdGgiLCJyZXRyaWVzIiwic2VsZiIsImNoZWNrIiwiZnMiLCJvcGVuIiwiZmQiLCJjb2RlIiwiY2xvc2VTeW5jIiwicHJlcGFyZVRhcmdldHMiLCJpYTMyIiwiYWxsQXJjaHMiLCJ0YXJnZXRzIiwid2luIiwicHVzaCIsImRlcGVuZGVuY3kiLCJQbGF0Zm9ybSIsIldJTkRPV1MiLCJsaW51eCIsIkxJTlVYIiwibWFjIiwiTUFDIiwib3MiLCJpc1dpbmRvd3MiLCJpc0xpbnV4IiwiY3JlYXRlVGFyZ2V0cyIsImJ1aWxkIiwic2V0dGluZ3MiLCJlcnJvciIsImV4aXQiLCJhc2FyIiwibnBtUmVidWlsZCIsImJpbmQiLCJlbGVjdHJvblZlcnNpb24iLCJkaXJlY3RvcmllcyIsImFwcCIsInRhcmdldCIsImluY2x1ZGVzIiwiYnVpbGRlckNsaU9wdGlvbnMiLCJybSIsInZlcmJvc2UiXSwic291cmNlcyI6WyIuLi9saWIvZWxlY3Ryb25CdWlsZGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby11bnVzZWQtdmFyc1xuaW1wb3J0IHJlZ2VuZXJhdG9yUnVudGltZSBmcm9tICdyZWdlbmVyYXRvci1ydW50aW1lL3J1bnRpbWUnO1xuaW1wb3J0IHNoZWxsIGZyb20gJ3NoZWxsanMnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHJpbXJhZiBmcm9tICdyaW1yYWYnO1xuaW1wb3J0IHNwYXduIGZyb20gJ2Nyb3NzLXNwYXduJztcbmltcG9ydCBMb2cgZnJvbSAnLi9sb2cnO1xuaW1wb3J0IGRlZmF1bHREZXBlbmRlbmNpZXMgZnJvbSAnLi9kZWZhdWx0RGVwZW5kZW5jaWVzJztcblxuLyoqXG4gKiBQcm9taXNmaWVkIHJpbXJhZi5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gZGlyUGF0aCAtIHBhdGggdG8gdGhlIGRpciB0byBiZSBkZWxldGVkXG4gKiBAcGFyYW0ge251bWJlcn0gZGVsYXkgLSBkZWxheSB0aGUgdGFzayBieSBtc1xuICogQHJldHVybnMge1Byb21pc2U8YW55Pn1cbiAqL1xuZnVuY3Rpb24gcmVtb3ZlRGlyKGRpclBhdGgsIGRlbGF5ID0gMCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgcmltcmFmKGRpclBhdGgsIHtcbiAgICAgICAgICAgICAgICBtYXhCdXN5VHJpZXM6IDEwMFxuICAgICAgICAgICAgfSwgKGVycikgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBkZWxheSk7XG4gICAgfSk7XG59XG5cbi8qKlxuICogV3JhcHBlciBmb3IgZWxlY3Ryb24tYnVpbGRlci5cbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSW5zdGFsbGVyQnVpbGRlciB7XG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtNZXRlb3JEZXNrdG9wfSAkIC0gY29udGV4dFxuICAgICAqXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoJCkge1xuICAgICAgICB0aGlzLmxvZyA9IG5ldyBMb2coJ2VsZWN0cm9uQnVpbGRlcicpO1xuICAgICAgICB0aGlzLiQgPSAkO1xuICAgICAgICB0aGlzLmZpcnN0UGFzcyA9IHRydWU7XG4gICAgICAgIHRoaXMubGFzdFJlYnVpbGQgPSB7fTtcbiAgICAgICAgdGhpcy5jdXJyZW50Q29udGV4dCA9IG51bGw7XG4gICAgICAgIHRoaXMuaW5zdGFsbGVyRGlyID0gcGF0aC5qb2luKHRoaXMuJC5lbnYub3B0aW9ucy5vdXRwdXQsIHRoaXMuJC5lbnYucGF0aHMuaW5zdGFsbGVyRGlyKTtcbiAgICAgICAgdGhpcy5wbGF0Zm9ybXMgPSBbXTtcbiAgICB9XG5cbiAgICBhc3luYyBpbml0KCkge1xuICAgICAgICB0aGlzLmJ1aWxkZXIgPSBhd2FpdCB0aGlzLiQuZ2V0RGVwZW5kZW5jeSgnZWxlY3Ryb24tYnVpbGRlcicsIGRlZmF1bHREZXBlbmRlbmNpZXNbJ2VsZWN0cm9uLWJ1aWxkZXInXSk7XG4gICAgICAgIGNvbnN0IGFwcEJ1aWxkZXIgPSBhd2FpdCB0aGlzLiQuZ2V0RGVwZW5kZW5jeSgnYXBwLWJ1aWxkZXItbGliJywgZGVmYXVsdERlcGVuZGVuY2llc1snZWxlY3Ryb24tYnVpbGRlciddLCBmYWxzZSk7XG5cbiAgICAgICAgdGhpcy55YXJuID0gcmVxdWlyZShwYXRoLmpvaW4oYXBwQnVpbGRlci5wYXRoLCAnb3V0JywgJ3V0aWwnLCAneWFybicpKTtcbiAgICAgICAgdGhpcy5nZXRHeXBFbnYgPSB0aGlzLnlhcm4uZ2V0R3lwRW52O1xuICAgICAgICB0aGlzLnBhY2thZ2VEZXBlbmRlbmNpZXMgPSByZXF1aXJlKHBhdGguam9pbihhcHBCdWlsZGVyLnBhdGgsICdvdXQnLCAndXRpbCcsICdwYWNrYWdlRGVwZW5kZW5jaWVzJykpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFByZXBhcmVzIHRoZSBsYXN0IHJlYnVpbGQgb2JqZWN0IGZvciBlbGVjdHJvbi1idWlsZGVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGFyY2hcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcGxhdGZvcm1cbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICAqL1xuICAgIHByZXBhcmVMYXN0UmVidWlsZE9iamVjdChhcmNoLCBwbGF0Zm9ybSA9IHByb2Nlc3MucGxhdGZvcm0pIHtcbiAgICAgICAgY29uc3QgcHJvZHVjdGlvbkRlcHMgPSB0aGlzLnBhY2thZ2VEZXBlbmRlbmNpZXNcbiAgICAgICAgICAgIC5jcmVhdGVMYXp5UHJvZHVjdGlvbkRlcHModGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5yb290KTtcbiAgICAgICAgdGhpcy5sYXN0UmVidWlsZCA9IHtcbiAgICAgICAgICAgIGZyYW1ld29ya0luZm86IHsgdmVyc2lvbjogdGhpcy4kLmdldEVsZWN0cm9uVmVyc2lvbigpLCB1c2VDdXN0b21EaXN0OiB0cnVlIH0sXG4gICAgICAgICAgICBwbGF0Zm9ybSxcbiAgICAgICAgICAgIGFyY2gsXG4gICAgICAgICAgICBwcm9kdWN0aW9uRGVwc1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5sYXN0UmVidWlsZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYWxscyBucG0gcmVidWlsZCBmcm9tIGVsZWN0cm9uLWJ1aWxkZXIuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGFyY2hcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcGxhdGZvcm1cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGluc3RhbGxcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICAgKi9cbiAgICBhc3luYyBpbnN0YWxsT3JSZWJ1aWxkKGFyY2gsIHBsYXRmb3JtID0gcHJvY2Vzcy5wbGF0Zm9ybSwgaW5zdGFsbCA9IGZhbHNlKSB7XG4gICAgICAgIHRoaXMubG9nLmRlYnVnKGBjYWxsaW5nIGluc3RhbGxPclJlYnVpbGQgZnJvbSBlbGVjdHJvbi1idWlsZGVyIGZvciBhcmNoICR7YXJjaH1gKTtcbiAgICAgICAgdGhpcy5wcmVwYXJlTGFzdFJlYnVpbGRPYmplY3QoYXJjaCwgcGxhdGZvcm0pO1xuICAgICAgICBhd2FpdCB0aGlzLnlhcm4uaW5zdGFsbE9yUmVidWlsZCh0aGlzLiQuZGVza3RvcC5nZXRTZXR0aW5ncygpLmJ1aWxkZXJPcHRpb25zIHx8IHt9LFxuICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5yb290LCB0aGlzLmxhc3RSZWJ1aWxkLCBpbnN0YWxsKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYWxsYmFjayBpbnZva2VkIGJlZm9yZSBidWlsZCBpcyBtYWRlLiBFbnN1cmVzIHRoYXQgYXBwLmFzYXIgaGF2ZSB0aGUgcmlnaHQgcmVidWlsdFxuICAgICAqIG5vZGVfbW9kdWxlcy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBjb250ZXh0XG4gICAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAgICovXG4gICAgYmVmb3JlQnVpbGQoY29udGV4dCkge1xuICAgICAgICB0aGlzLmN1cnJlbnRDb250ZXh0ID0gT2JqZWN0LmFzc2lnbih7fSwgY29udGV4dCk7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwbGF0Zm9ybU1hdGNoZXMgPSBwcm9jZXNzLnBsYXRmb3JtID09PSBjb250ZXh0LnBsYXRmb3JtLm5vZGVOYW1lO1xuICAgICAgICAgICAgY29uc3QgcmVidWlsZCA9IHBsYXRmb3JtTWF0Y2hlcyAmJiBjb250ZXh0LmFyY2ggIT09IHRoaXMubGFzdFJlYnVpbGQuYXJjaDtcbiAgICAgICAgICAgIGlmICghcGxhdGZvcm1NYXRjaGVzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2cud2Fybignc2tpcHBpbmcgZGVwZW5kZW5jaWVzIHJlYnVpbGQgYmVjYXVzZSBwbGF0Zm9ybSBpcyBkaWZmZXJlbnQsIGlmIHlvdSBoYXZlIG5hdGl2ZSAnICtcbiAgICAgICAgICAgICAgICAgICAgJ25vZGUgbW9kdWxlcyBhcyB5b3VyIGFwcCBkZXBlbmRlbmNpZXMgeW91IHNob3VsZCBvZCB0aGUgYnVpbGQgb24gdGhlIHRhcmdldCBwbGF0Zm9ybSBvbmx5Jyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghcmVidWlsZCkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZU5vZGVNb2R1bGVzT3V0KClcbiAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGUgPT4gcmVqZWN0KGUpKVxuICAgICAgICAgICAgICAgICAgICAudGhlbigoKSA9PiBzZXRUaW1lb3V0KCgpID0+IHJlc29sdmUoZmFsc2UpLCAyMDAwKSk7XG4gICAgICAgICAgICAgICAgLy8gVGltZW91dCBoZWxwcyBvbiBXaW5kb3dzIHRvIGNsZWFyIHRoZSBmaWxlIGxvY2tzLlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBMZXRzIHJlYnVpbGQgdGhlIG5vZGVfbW9kdWxlcyBmb3IgZGlmZmVyZW50IGFyY2guXG4gICAgICAgICAgICAgICAgdGhpcy5pbnN0YWxsT3JSZWJ1aWxkKGNvbnRleHQuYXJjaCwgY29udGV4dC5wbGF0Zm9ybS5ub2RlTmFtZSlcbiAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGUgPT4gcmVqZWN0KGUpKVxuICAgICAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLiQuZWxlY3Ryb25BcHAuaW5zdGFsbExvY2FsTm9kZU1vZHVsZXMoY29udGV4dC5hcmNoKSlcbiAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGUgPT4gcmVqZWN0KGUpKVxuICAgICAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZWxlY3Ryb25BcHAuc2NhZmZvbGQuY3JlYXRlQXBwUm9vdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy4kLmVsZWN0cm9uQXBwLnNjYWZmb2xkLmNvcHlTa2VsZXRvbkFwcCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJC5lbGVjdHJvbkFwcC5wYWNrU2tlbGV0b25Ub0FzYXIoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLm1ldGVvckFzYXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAuZGVza3RvcEFzYXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAuZXh0cmFjdGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgLmNhdGNoKGUgPT4gcmVqZWN0KGUpKVxuICAgICAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLm1vdmVOb2RlTW9kdWxlc091dCgpKVxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZSA9PiByZWplY3QoZSkpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKCgpID0+IHJlc29sdmUoZmFsc2UpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGJhY2sgdG8gYmUgaW52b2tlZCBhZnRlciBwYWNraW5nLiBSZXN0b3JlcyBub2RlX21vZHVsZXMgdG8gdGhlIC5kZXNrdG9wLWJ1aWxkLlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgICAqL1xuICAgIGFmdGVyUGFjayhjb250ZXh0KSB7XG4gICAgICAgIHRoaXMucGxhdGZvcm1zID0gdGhpcy5wbGF0Zm9ybXNcbiAgICAgICAgICAgIC5maWx0ZXIocGxhdGZvcm0gPT4gcGxhdGZvcm0gIT09IGNvbnRleHQuZWxlY3Ryb25QbGF0Zm9ybU5hbWUpO1xuICAgICAgICBpZiAodGhpcy5wbGF0Zm9ybXMubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHNoZWxsLmNvbmZpZy5mYXRhbCA9IHRydWU7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiQudXRpbHMuZXhpc3RzKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAuZXh0cmFjdGVkTm9kZU1vZHVsZXMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2cuZGVidWcoJ2luamVjdGluZyBleHRyYWN0ZWQgbW9kdWxlcycpO1xuICAgICAgICAgICAgICAgIHNoZWxsLmNwKFxuICAgICAgICAgICAgICAgICAgICAnLVJmJyxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5leHRyYWN0ZWROb2RlTW9kdWxlcyxcbiAgICAgICAgICAgICAgICAgICAgcGF0aC5qb2luKHRoaXMuZ2V0UGFja2FnZWRBcHBQYXRoKGNvbnRleHQpLCAnbm9kZV9tb2R1bGVzJylcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmxvZy5kZWJ1ZygnbW92aW5nIG5vZGVfbW9kdWxlcyBiYWNrJyk7XG4gICAgICAgICAgICAvLyBNb3ZlIG5vZGVfbW9kdWxlcyBiYWNrLlxuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHNoZWxsLm12KFxuICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLnRtcE5vZGVNb2R1bGVzLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLm5vZGVNb2R1bGVzXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICByZWplY3QoZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICBzaGVsbC5jb25maWcucmVzZXQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMuZmlyc3RQYXNzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5maXJzdFBhc3MgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMubG9nLmRlYnVnKCdub2RlX21vZHVsZXMgbW92ZWQgYmFjaycpO1xuXG4gICAgICAgICAgICB0aGlzLndhaXQoKVxuICAgICAgICAgICAgICAgIC5jYXRjaChlID0+IHJlamVjdChlKSlcbiAgICAgICAgICAgICAgICAudGhlbigoKSA9PiByZXNvbHZlKCkpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGlzIGNvbW1hbmQga2lsbHMgb3JwaGFuZWQgTVNCdWlsZC5leGUgcHJvY2Vzc2VzLlxuICAgICAqIFNvbWV0aW1lIGFmdGVyIG5hdGl2ZSBub2RlX21vZHVsZXMgY29tcGlsYXRpb24gdGhleSBhcmUgc3RpbGwgd3JpdGluZyBzb21lIGxvZ3MsXG4gICAgICogcHJldmVudCBub2RlX21vZHVsZXMgZnJvbSBiZWluZyBkZWxldGVkLlxuICAgICAqL1xuICAgIGtpbGxNU0J1aWxkKCkge1xuICAgICAgICBpZiAodGhpcy5jdXJyZW50Q29udGV4dC5wbGF0Zm9ybS5ub2RlTmFtZSAhPT0gJ3dpbjMyJykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBvdXQgPSBzcGF3blxuICAgICAgICAgICAgICAgIC5zeW5jKFxuICAgICAgICAgICAgICAgICAgICAnd21pYycsXG4gICAgICAgICAgICAgICAgICAgIFsncHJvY2VzcycsICd3aGVyZScsICdjYXB0aW9uPVwiTVNCdWlsZC5leGVcIicsICdnZXQnLCAncHJvY2Vzc2lkJ11cbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgLnN0ZG91dC50b1N0cmluZygndXRmLTgnKVxuICAgICAgICAgICAgICAgIC5zcGxpdCgnXFxuJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cCgvKFxcZCspLywgJ2dtJyk7XG4gICAgICAgICAgICAvLyBObyB3ZSB3aWxsIGNoZWNrIGZvciB0aG9zZSB3aXRoIHRoZSBtYXRjaGluZyBwYXJhbXMuXG4gICAgICAgICAgICBvdXQuZm9yRWFjaCgobGluZSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyhsaW5lKSB8fCBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2cuZGVidWcoYGtpbGxpbmcgTVNCdWlsZC5leGUgYXQgcGlkOiAke21hdGNoWzFdfWApO1xuICAgICAgICAgICAgICAgICAgICBzcGF3bi5zeW5jKCd0YXNra2lsbCcsIFsnL3BpZCcsIG1hdGNoWzFdLCAnL2YnLCAnL3QnXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlZ2V4Lmxhc3RJbmRleCA9IDA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZGVidWcoJ2tpbGwgTVNCdWlsZCBmYWlsZWQnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHBhdGggdG8gcGFja2FnZWQgYXBwLlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICovXG4gICAgZ2V0UGFja2FnZWRBcHBQYXRoKGNvbnRleHQgPSB7fSkge1xuICAgICAgICBpZiAodGhpcy5jdXJyZW50Q29udGV4dC5wbGF0Zm9ybS5ub2RlTmFtZSA9PT0gJ2RhcndpbicpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXRoLmpvaW4oXG4gICAgICAgICAgICAgICAgdGhpcy5pbnN0YWxsZXJEaXIsXG4gICAgICAgICAgICAgICAgJ21hYycsXG4gICAgICAgICAgICAgICAgYCR7Y29udGV4dC5wYWNrYWdlci5hcHBJbmZvLnByb2R1Y3RGaWxlbmFtZX0uYXBwYCxcbiAgICAgICAgICAgICAgICAnQ29udGVudHMnLCAnUmVzb3VyY2VzJywgJ2FwcCdcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGxhdGZvcm1EaXIgPVxuICAgICAgICAgICAgYCR7dGhpcy5jdXJyZW50Q29udGV4dC5wbGF0Zm9ybS5ub2RlTmFtZSA9PT0gJ3dpbjMyJyA/ICd3aW4nIDogJ2xpbnV4J30tJHt0aGlzLmN1cnJlbnRDb250ZXh0LmFyY2ggPT09ICdpYTMyJyA/ICdpYTMyLScgOiAnJ311bnBhY2tlZGA7XG4gICAgICAgIHJldHVybiBwYXRoLmpvaW4oXG4gICAgICAgICAgICB0aGlzLmluc3RhbGxlckRpcixcbiAgICAgICAgICAgIHBsYXRmb3JtRGlyLFxuICAgICAgICAgICAgJ3Jlc291cmNlcycsICdhcHAnXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogT24gV2luZG93cyBpdCB3YWl0cyBmb3IgdGhlIGFwcC5hc2FyIGluIHRoZSBwYWNrZWQgYXBwIHRvIGJlIGZyZWUgKG5vIGZpbGUgbG9ja3MpLlxuICAgICAqIEByZXR1cm5zIHsqfVxuICAgICAqL1xuICAgIHdhaXQoKSB7XG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRDb250ZXh0LnBsYXRmb3JtLm5vZGVOYW1lICE9PSAnd2luMzInKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYXBwQXNhclBhdGggPSBwYXRoLmpvaW4oXG4gICAgICAgICAgICB0aGlzLmdldFBhY2thZ2VkQXBwUGF0aCgpLFxuICAgICAgICAgICAgJ2FwcC5hc2FyJ1xuICAgICAgICApO1xuICAgICAgICBsZXQgcmV0cmllcyA9IDA7XG4gICAgICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgZnVuY3Rpb24gY2hlY2soKSB7XG4gICAgICAgICAgICAgICAgZnMub3BlbihhcHBBc2FyUGF0aCwgJ3IrJywgKGVyciwgZmQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0cmllcyArPSAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgIT09ICdFTk9FTlQnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5sb2cuZGVidWcoYHdhaXRpbmcgZm9yIGFwcC5hc2FyIHRvIGJlIHJlYWRhYmxlLCAkeydjb2RlJyBpbiBlcnIgPyBgY3VycmVudGx5IHJlYWRpbmcgaXQgcmV0dXJucyAke2Vyci5jb2RlfWAgOiAnJ31gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmV0cmllcyA8IDYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiBjaGVjaygpLCA0MDAwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoYGZpbGUgaXMgbG9ja2VkOiAke2FwcEFzYXJQYXRofWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgZnMuY2xvc2VTeW5jKGZkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2hlY2soKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUHJlcGFyZXMgdGhlIHRhcmdldCBvYmplY3QgcGFzc2VkIHRvIHRoZSBlbGVjdHJvbi1idWlsZGVyLlxuICAgICAqXG4gICAgICogQHJldHVybnMge01hcDxQbGF0Zm9ybSwgTWFwPEFyY2gsIEFycmF5PHN0cmluZz4+Pn1cbiAgICAgKi9cbiAgICBwcmVwYXJlVGFyZ2V0cygpIHtcbiAgICAgICAgbGV0IGFyY2ggPSB0aGlzLiQuZW52Lm9wdGlvbnMuaWEzMiA/ICdpYTMyJyA6ICd4NjQnO1xuICAgICAgICBhcmNoID0gdGhpcy4kLmVudi5vcHRpb25zLmFsbEFyY2hzID8gJ2FsbCcgOiBhcmNoO1xuXG4gICAgICAgIGNvbnN0IHRhcmdldHMgPSBbXTtcblxuICAgICAgICBpZiAodGhpcy4kLmVudi5vcHRpb25zLndpbikge1xuICAgICAgICAgICAgdGFyZ2V0cy5wdXNoKHRoaXMuYnVpbGRlci5kZXBlbmRlbmN5LlBsYXRmb3JtLldJTkRPV1MpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiQuZW52Lm9wdGlvbnMubGludXgpIHtcbiAgICAgICAgICAgIHRhcmdldHMucHVzaCh0aGlzLmJ1aWxkZXIuZGVwZW5kZW5jeS5QbGF0Zm9ybS5MSU5VWCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuJC5lbnYub3B0aW9ucy5tYWMpIHtcbiAgICAgICAgICAgIHRhcmdldHMucHVzaCh0aGlzLmJ1aWxkZXIuZGVwZW5kZW5jeS5QbGF0Zm9ybS5NQUMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRhcmdldHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kLmVudi5vcy5pc1dpbmRvd3MpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXRzLnB1c2godGhpcy5idWlsZGVyLmRlcGVuZGVuY3kuUGxhdGZvcm0uV0lORE9XUyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuJC5lbnYub3MuaXNMaW51eCkge1xuICAgICAgICAgICAgICAgIHRhcmdldHMucHVzaCh0aGlzLmJ1aWxkZXIuZGVwZW5kZW5jeS5QbGF0Zm9ybS5MSU5VWCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRhcmdldHMucHVzaCh0aGlzLmJ1aWxkZXIuZGVwZW5kZW5jeS5QbGF0Zm9ybS5NQUMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmJ1aWxkZXIuZGVwZW5kZW5jeS5jcmVhdGVUYXJnZXRzKHRhcmdldHMsIG51bGwsIGFyY2gpO1xuICAgIH1cblxuICAgIGFzeW5jIGJ1aWxkKCkge1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMuJC5kZXNrdG9wLmdldFNldHRpbmdzKCk7XG4gICAgICAgIGlmICghKCdidWlsZGVyT3B0aW9ucycgaW4gc2V0dGluZ3MpKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcihcbiAgICAgICAgICAgICAgICAnbm8gYnVpbGRlck9wdGlvbnMgaW4gc2V0dGluZ3MuanNvbiwgYWJvcnRpbmcnXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYnVpbGRlck9wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCBzZXR0aW5ncy5idWlsZGVyT3B0aW9ucyk7XG5cbiAgICAgICAgYnVpbGRlck9wdGlvbnMuYXNhciA9IGZhbHNlO1xuICAgICAgICBidWlsZGVyT3B0aW9ucy5ucG1SZWJ1aWxkID0gdHJ1ZTtcblxuICAgICAgICBidWlsZGVyT3B0aW9ucy5iZWZvcmVCdWlsZCA9IHRoaXMuYmVmb3JlQnVpbGQuYmluZCh0aGlzKTtcbiAgICAgICAgYnVpbGRlck9wdGlvbnMuYWZ0ZXJQYWNrID0gdGhpcy5hZnRlclBhY2suYmluZCh0aGlzKTtcbiAgICAgICAgYnVpbGRlck9wdGlvbnMuZWxlY3Ryb25WZXJzaW9uID0gdGhpcy4kLmdldEVsZWN0cm9uVmVyc2lvbigpO1xuXG4gICAgICAgIGJ1aWxkZXJPcHRpb25zLmRpcmVjdG9yaWVzID0ge1xuICAgICAgICAgICAgYXBwOiB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLnJvb3QsXG4gICAgICAgICAgICBvdXRwdXQ6IHBhdGguam9pbih0aGlzLiQuZW52Lm9wdGlvbnMub3V0cHV0LCB0aGlzLiQuZW52LnBhdGhzLmluc3RhbGxlckRpcilcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoJ21hYycgaW4gYnVpbGRlck9wdGlvbnMgJiYgJ3RhcmdldCcgaW4gYnVpbGRlck9wdGlvbnMubWFjKSB7XG4gICAgICAgICAgICBpZiAoYnVpbGRlck9wdGlvbnMubWFjLnRhcmdldC5pbmNsdWRlcygnbWFzJykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXRmb3JtcyA9IFsnZGFyd2luJywgJ21hcyddO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMubG9nLmRlYnVnKCdjYWxsaW5nIGJ1aWxkIGZyb20gZWxlY3Ryb24tYnVpbGRlcicpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5idWlsZGVyLmRlcGVuZGVuY3kuYnVpbGQoT2JqZWN0LmFzc2lnbih7XG4gICAgICAgICAgICAgICAgdGFyZ2V0czogdGhpcy5wcmVwYXJlVGFyZ2V0cygpLFxuICAgICAgICAgICAgICAgIGNvbmZpZzogYnVpbGRlck9wdGlvbnNcbiAgICAgICAgICAgIH0sIHNldHRpbmdzLmJ1aWxkZXJDbGlPcHRpb25zKSk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiQudXRpbHMuZXhpc3RzKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAuZXh0cmFjdGVkTm9kZU1vZHVsZXMpKSB7XG4gICAgICAgICAgICAgICAgc2hlbGwucm0oJy1yZicsIHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAuZXh0cmFjdGVkTm9kZU1vZHVsZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igd2hpbGUgYnVpbGRpbmcgaW5zdGFsbGVyOiAnLCBlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIG5vZGVfbW9kdWxlcyBvdXQgb2YgdGhlIGFwcCBiZWNhdXNlIHdoaWxlIHRoZSBhcHAgd2lsbCBiZSBwYWNrYWdlZFxuICAgICAqIHdlIGRvIG5vdCB3YW50IGl0IHRvIGJlIHRoZXJlLlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPGFueT59XG4gICAgICovXG4gICAgbW92ZU5vZGVNb2R1bGVzT3V0KCkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5sb2cuZGVidWcoJ21vdmluZyBub2RlX21vZHVsZXMgb3V0LCBiZWNhdXNlIHdlIGhhdmUgdGhlbSBhbHJlYWR5IGluJyArXG4gICAgICAgICAgICAgICAgJyBhcHAuYXNhcicpO1xuICAgICAgICAgICAgdGhpcy5raWxsTVNCdWlsZCgpO1xuICAgICAgICAgICAgcmVtb3ZlRGlyKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAudG1wTm9kZU1vZHVsZXMpXG4gICAgICAgICAgICAgICAgLmNhdGNoKGUgPT4gcmVqZWN0KGUpKVxuICAgICAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc2hlbGwuY29uZmlnLmZhdGFsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgc2hlbGwuY29uZmlnLnZlcmJvc2UgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2hlbGwubXYoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5ub2RlTW9kdWxlcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLnRtcE5vZGVNb2R1bGVzXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2hlbGwuY29uZmlnLnJlc2V0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy53YWl0KCk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNoZWxsLmNvbmZpZy5yZXNldCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuY2F0Y2goZSA9PiByZWplY3QoZSkpXG4gICAgICAgICAgICAgICAgLnRoZW4oKCkgPT4gcmVtb3ZlRGlyKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubm9kZU1vZHVsZXMsIDEwMDApKVxuICAgICAgICAgICAgICAgIC5jYXRjaChlID0+IHJlamVjdChlKSlcbiAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLndhaXQoKSlcbiAgICAgICAgICAgICAgICAuY2F0Y2gocmVqZWN0KVxuICAgICAgICAgICAgICAgIC50aGVuKHJlc29sdmUpO1xuICAgICAgICB9KTtcbiAgICB9XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQVJBOztBQVVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU0EsU0FBVCxDQUFtQkMsT0FBbkIsRUFBNEJDLEtBQUssR0FBRyxDQUFwQyxFQUF1QztFQUNuQyxPQUFPLElBQUlDLE9BQUosQ0FBWSxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7SUFDcENDLFVBQVUsQ0FBQyxNQUFNO01BQ2IsSUFBQUMsZUFBQSxFQUFPTixPQUFQLEVBQWdCO1FBQ1pPLFlBQVksRUFBRTtNQURGLENBQWhCLEVBRUlDLEdBQUQsSUFBUztRQUNSLElBQUlBLEdBQUosRUFBUztVQUNMSixNQUFNLENBQUNJLEdBQUQsQ0FBTjtRQUNILENBRkQsTUFFTztVQUNITCxPQUFPO1FBQ1Y7TUFDSixDQVJEO0lBU0gsQ0FWUyxFQVVQRixLQVZPLENBQVY7RUFXSCxDQVpNLENBQVA7QUFhSDtBQUVEO0FBQ0E7QUFDQTs7O0FBQ2UsTUFBTVEsZ0JBQU4sQ0FBdUI7RUFDbEM7QUFDSjtBQUNBO0FBQ0E7QUFDQTtFQUNJQyxXQUFXLENBQUNDLENBQUQsRUFBSTtJQUNYLEtBQUtDLEdBQUwsR0FBVyxJQUFJQyxZQUFKLENBQVEsaUJBQVIsQ0FBWDtJQUNBLEtBQUtGLENBQUwsR0FBU0EsQ0FBVDtJQUNBLEtBQUtHLFNBQUwsR0FBaUIsSUFBakI7SUFDQSxLQUFLQyxXQUFMLEdBQW1CLEVBQW5CO0lBQ0EsS0FBS0MsY0FBTCxHQUFzQixJQUF0QjtJQUNBLEtBQUtDLFlBQUwsR0FBb0JDLGFBQUEsQ0FBS0MsSUFBTCxDQUFVLEtBQUtSLENBQUwsQ0FBT1MsR0FBUCxDQUFXQyxPQUFYLENBQW1C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