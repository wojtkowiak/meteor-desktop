"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _runtime = _interopRequireDefault(require("regenerator-runtime/runtime"));

var _fs = _interopRequireDefault(require("fs"));

var _crossSpawn = _interopRequireDefault(require("cross-spawn"));

var _semver = _interopRequireDefault(require("semver"));

var _shelljs = _interopRequireDefault(require("shelljs"));

var _path = _interopRequireDefault(require("path"));

var _singleLineLog = _interopRequireDefault(require("single-line-log"));

var _asar = _interopRequireDefault(require("@electron/asar"));

var _nodeFetch = _interopRequireDefault(require("node-fetch"));

var _isDesktopInjector = _interopRequireDefault(require("../skeleton/modules/autoupdate/isDesktopInjector"));

var _log = _interopRequireDefault(require("./log"));

var _meteorManager = _interopRequireDefault(require("./meteorManager"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// eslint-disable-next-line no-unused-vars
const {
  join
} = _path.default;
const sll = _singleLineLog.default.stdout; // TODO: refactor all strategy ifs to one place

/**
 * Represents the Meteor app.
 * @property {MeteorDesktop} $
 * @class
 */

class MeteorApp {
  /**
   * @param {MeteorDesktop} $ - context
   * @constructor
   */
  constructor($) {
    this.log = new _log.default('meteorApp');
    this.$ = $;
    this.meteorManager = new _meteorManager.default($);
    this.mobilePlatform = null;
    this.oldManifest = null;
    this.injector = new _isDesktopInjector.default();
    this.matcher = new RegExp('__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\("([^"]*)"\\)\\)');
    this.replacer = new RegExp('(__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\()"([^"]*)"(\\)\\))');
    this.meteorVersion = null;
    this.indexHTMLstrategy = null;
    this.indexHTMLStrategies = {
      INDEX_FROM_CORDOVA_BUILD: 1,
      INDEX_FROM_RUNNING_SERVER: 2
    };
    this.deprectatedPackages = ['omega:meteor-desktop-localstorage'];
  }
  /**
   * Remove any deprecated packages from meteor project.
   * @returns {Promise<void>}
   */


  async removeDeprecatedPackages() {
    try {
      if (this.meteorManager.checkPackages(this.deprectatedPackages)) {
        this.log.info('deprecated meteor plugins found, removing them');
        await this.meteorManager.deletePackages(this.deprectatedPackages);
      }
    } catch (e) {
      throw new Error(e);
    }
  }
  /**
   * Ensures that required packages are added to the Meteor app.
   */


  async ensureDesktopHCPPackages() {
    const desktopHCPPackages = ['communitypackages:meteor-desktop-watcher', 'communitypackages:meteor-desktop-bundler'];

    if (this.$.desktop.getSettings().desktopHCP) {
      this.log.verbose('desktopHCP is enabled, checking for required packages');
      const packagesWithVersion = desktopHCPPackages.map(packageName => `${packageName}@${this.$.getVersion()}`);

      try {
        await this.meteorManager.ensurePackages(desktopHCPPackages, packagesWithVersion, 'desktopHCP');
      } catch (e) {
        throw new Error(e);
      }
    } else {
      this.log.verbose('desktopHCP is not enabled, removing required packages');

      try {
        if (this.meteorManager.checkPackages(desktopHCPPackages)) {
          await this.meteorManager.deletePackages(desktopHCPPackages);
        }
      } catch (e) {
        throw new Error(e);
      }
    }
  }
  /**
   * Adds entry to .meteor/.gitignore if necessary.
   */


  updateGitIgnore() {
    this.log.verbose('updating .meteor/.gitignore'); // Lets read the .meteor/.gitignore and filter out blank lines.

    const gitIgnore = _fs.default.readFileSync(this.$.env.paths.meteorApp.gitIgnore, 'UTF-8').split('\n').filter(ignoredPath => ignoredPath.trim() !== '');

    if (!~gitIgnore.indexOf(this.$.env.paths.electronApp.rootName)) {
      this.log.verbose(`adding ${this.$.env.paths.electronApp.rootName} to .meteor/.gitignore`);
      gitIgnore.push(this.$.env.paths.electronApp.rootName);

      _fs.default.writeFileSync(this.$.env.paths.meteorApp.gitIgnore, gitIgnore.join('\n'), 'UTF-8');
    }
  }
  /**
   * Reads the Meteor release version used in the app.
   * @returns {string}
   */


  getMeteorRelease() {
    let release = _fs.default.readFileSync(this.$.env.paths.meteorApp.release, 'UTF-8').replace(/\r/gm, '').split('\n')[0];

    [, release] = release.split('@'); // We do not care if it is beta.

    if (~release.indexOf('-')) {
      [release] = release.split('-');
    }

    return release;
  }
  /**
   * Cast Meteor release to semver version.
   * @returns {string}
   */


  castMeteorReleaseToSemver() {
    return `${this.getMeteorRelease()}.0.0`.match(/(^\d+\.\d+\.\d+)/gmi)[0];
  }
  /**
   * Validate meteor version against a versionRange.
   * @param {string} versionRange - semver version range
   */


  checkMeteorVersion(versionRange) {
    const release = this.castMeteorReleaseToSemver();

    if (!_semver.default.satisfies(release, versionRange)) {
      if (this.$.env.options.skipMobileBuild) {
        this.log.error(`wrong meteor version (${release}) in project - only ` + `${versionRange} is supported`);
      } else {
        this.log.error(`wrong meteor version (${release}) in project - only ` + `${versionRange} is supported for automatic meteor builds (you can always ` + 'try with `--skip-mobile-build` if you are using meteor >= 1.2.1');
      }

      process.exit(1);
    }
  }
  /**
   * Decides which strategy to use while trying to get client build out of Meteor project.
   * @returns {number}
   */


  chooseStrategy() {
    if (this.$.env.options.forceCordovaBuild) {
      return this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD;
    }

    const release = this.castMeteorReleaseToSemver();

    if (_semver.default.satisfies(release, '> 1.3.4')) {
      return this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER;
    }

    if (_semver.default.satisfies(release, '1.3.4')) {
      const explodedVersion = this.getMeteorRelease().split('.');

      if (explodedVersion.length >= 4) {
        if (explodedVersion[3] > 1) {
          return this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER;
        }

        return this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD;
      }
    }

    return this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD;
  }
  /**
   * Checks required preconditions.
   * - Meteor version
   * - is mobile platform added
   */


  async checkPreconditions() {
    if (this.$.env.options.skipMobileBuild) {
      this.checkMeteorVersion('>= 1.2.1');
    } else {
      this.checkMeteorVersion('>= 1.3.3');
      this.indexHTMLstrategy = this.chooseStrategy();

      if (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD) {
        this.log.debug('meteor version is < 1.3.4.2 so the index.html from cordova-build will' + ' be used');
      } else {
        this.log.debug('meteor version is >= 1.3.4.2 so the index.html will be downloaded ' + 'from __cordova/index.html');
      }
    }

    if (!this.$.env.options.skipMobileBuild) {
      const platforms = _fs.default.readFileSync(this.$.env.paths.meteorApp.platforms, 'UTF-8');

      if (!~platforms.indexOf('android') && !~platforms.indexOf('ios')) {
        if (!this.$.env.options.android) {
          this.mobilePlatform = 'ios';
        } else {
          this.mobilePlatform = 'android';
        }

        this.log.warn(`no mobile target detected - will add '${this.mobilePlatform}' ` + 'just to get a mobile build');

        try {
          await this.addMobilePlatform(this.mobilePlatform);
        } catch (e) {
          this.log.error('failed to add a mobile platform - please try to do it manually');
          process.exit(1);
        }
      }
    }
  }
  /**
   * Tries to add a mobile platform to meteor project.
   * @param {string} platform - platform to add
   * @returns {Promise}
   */


  addMobilePlatform(platform) {
    return new Promise((resolve, reject) => {
      this.log.verbose(`adding mobile platform: ${platform}`);
      (0, _crossSpawn.default)('meteor', ['add-platform', platform], {
        cwd: this.$.env.paths.meteorApp.root,
        stdio: this.$.env.stdio
      }).on('exit', () => {
        const platforms = _fs.default.readFileSync(this.$.env.paths.meteorApp.platforms, 'UTF-8');

        if (!~platforms.indexOf('android') && !~platforms.indexOf('ios')) {
          reject();
        } else {
          resolve();
        }
      });
    });
  }
  /**
   * Tries to remove a mobile platform from meteor project.
   * @param {string} platform - platform to remove
   * @returns {Promise}
   */


  removeMobilePlatform(platform) {
    if (this.$.env.options.skipRemoveMobilePlatform) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.log.verbose(`removing mobile platform: ${platform}`);
      (0, _crossSpawn.default)('meteor', ['remove-platform', platform], {
        cwd: this.$.env.paths.meteorApp.root,
        stdio: this.$.env.stdio,
        env: Object.assign({
          METEOR_PRETTY_OUTPUT: 0
        }, process.env)
      }).on('exit', () => {
        const platforms = _fs.default.readFileSync(this.$.env.paths.meteorApp.platforms, 'UTF-8');

        if (~platforms.indexOf(platform)) {
          reject();
        } else {
          resolve();
        }
      });
    });
  }
  /**
   * Just checks for index.html and program.json existence.
   * @returns {boolean}
   */


  isCordovaBuildReady() {
    if (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD) {
      return this.$.utils.exists(this.$.env.paths.meteorApp.cordovaBuildIndex) && this.$.utils.exists(this.$.env.paths.meteorApp.cordovaBuildProgramJson) && (!this.oldManifest || this.oldManifest && this.oldManifest !== _fs.default.readFileSync(this.$.env.paths.meteorApp.cordovaBuildProgramJson, 'UTF-8'));
    }

    return this.$.utils.exists(this.$.env.paths.meteorApp.webCordovaProgramJson) && (!this.oldManifest || this.oldManifest && this.oldManifest !== _fs.default.readFileSync(this.$.env.paths.meteorApp.webCordovaProgramJson, 'UTF-8'));
  }
  /**
   * Fetches index.html from running project.
   * @returns {Promise.<*>}
   */


  async acquireIndex() {
    const port = this.$.env.options.port ? this.$.env.options.port : 3080;
    this.log.info('acquiring index.html');
    const res = await (0, _nodeFetch.default)(`http://127.0.0.1:${port}/__cordova/index.html`);
    const text = await res.text(); // Simple test if we really download index.html for web.cordova.

    if (~text.indexOf('src="/cordova.js"')) {
      return text;
    }

    return false;
  }
  /**
   * Fetches mainfest.json from running project.
   * @returns {Promise.<void>}
   */


  async acquireManifest() {
    const port = this.$.env.options.port ? this.$.env.options.port : 3080;
    this.log.info('acquiring manifest.json');
    const res = await (0, _nodeFetch.default)(`http://127.0.0.1:${port}/__cordova/manifest.json?meteor_dont_serve_index=true`);
    const text = await res.text();
    return JSON.parse(text);
  }
  /**
   * Tries to get a mobile build from meteor app.
   * In case of failure leaves a meteor.log.
   * A lot of stuff is happening here - but the main aim is to get a mobile build from
   * .meteor/local/cordova-build/www/application and exit as soon as possible.
   *
   * @returns {Promise}
   */


  buildMobileTarget() {
    const programJson = this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD ? this.$.env.paths.meteorApp.cordovaBuildProgramJson : this.$.env.paths.meteorApp.webCordovaProgramJson;

    if (this.$.utils.exists(programJson)) {
      this.oldManifest = _fs.default.readFileSync(programJson, 'UTF-8');
    }

    return new Promise((resolve, reject) => {
      const self = this;
      let log = '';
      let desiredExit = false;
      let buildTimeout = null;
      let errorTimeout = null;
      let messageTimeout = null;
      let killTimeout = null;
      let cordovaCheckInterval = null;
      let portProblem = false;

      function windowsKill(pid) {
        self.log.debug(`killing pid: ${pid}`);

        _crossSpawn.default.sync('taskkill', ['/pid', pid, '/f', '/t']); // We will look for other process which might have been created outside the
        // process tree.
        // Lets list all node.exe processes.


        const out = _crossSpawn.default.sync('wmic', ['process', 'where', 'caption="node.exe"', 'get', 'commandline,processid']).stdout.toString('utf-8').split('\n');

        const args = self.prepareArguments(); // Lets mount regex.

        const regexV1 = new RegExp(`${args.join('\\s+')}\\s+(\\d+)`, 'gm');
        const regexV2 = new RegExp(`"${args.join('"\\s+"')}"\\s+(\\d+)`, 'gm'); // No we will check for those with the matching params.

        out.forEach(line => {
          const match = regexV1.exec(line) || regexV2.exec(line) || false;

          if (match) {
            self.log.debug(`killing pid: ${match[1]}`);

            _crossSpawn.default.sync('taskkill', ['/pid', match[1], '/f', '/t']);
          }

          regexV1.lastIndex = 0;
          regexV2.lastIndex = 0;
        });
      }

      function writeLog() {
        _fs.default.writeFileSync('meteor.log', log, 'UTF-8');
      }

      function clearTimeoutsAndIntervals() {
        clearInterval(cordovaCheckInterval);
        clearTimeout(buildTimeout);
        clearTimeout(errorTimeout);
        clearTimeout(messageTimeout);
        clearTimeout(killTimeout);
      }

      const args = this.prepareArguments();
      this.log.info(`running "meteor ${args.join(' ')}"... this might take a while`);
      const env = {
        METEOR_PRETTY_OUTPUT: 0,
        METEOR_NO_RELEASE_CHECK: 1
      };

      if (this.$.env.options.prodDebug) {
        env.METEOR_DESKOP_PROD_DEBUG = true;
      } // Lets spawn meteor.


      const child = (0, _crossSpawn.default)('meteor', args, {
        env: Object.assign(env, process.env),
        cwd: this.$.env.paths.meteorApp.root
      }, {
        shell: true
      }); // Kills the currently running meteor command.

      function kill() {
        sll('');
        child.kill('SIGKILL');

        if (self.$.env.os.isWindows) {
          windowsKill(child.pid);
        }
      }

      function exit() {
        killTimeout = setTimeout(() => {
          clearTimeoutsAndIntervals();
          desiredExit = true;
          kill();
          resolve();
        }, 500);
      }

      function copyBuild() {
        self.copyBuild().then(() => {
          exit();
        }).catch(() => {
          clearTimeoutsAndIntervals();
          kill();
          writeLog();
          reject('copy');
        });
      }

      cordovaCheckInterval = setInterval(() => {
        // Check if we already have cordova-build ready.
        if (this.isCordovaBuildReady()) {
          // If so, then exit immediately.
          if (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD) {
            copyBuild();
          }
        }
      }, 1000);
      child.stderr.on('data', chunk => {
        const line = chunk.toString('UTF-8');
        log += `${line}\n`;

        if (errorTimeout) {
          clearTimeout(errorTimeout);
        } // Do not exit if this is the warning for using --production.
        // Output exceeds -> https://github.com/meteor/meteor/issues/8592


        if (!~line.indexOf('--production') && !~line.indexOf('Output exceeds ') && !~line.indexOf('Node#moveTo') && !~line.indexOf('Browserslist') && Array.isArray(self.$.env.options.ignoreStderr) && self.$.env.options.ignoreStderr.every(str => !~line.indexOf(str))) {
          self.log.warn('STDERR:', line); // We will exit 1s after last error in stderr.

          errorTimeout = setTimeout(() => {
            clearTimeoutsAndIntervals();
            kill();
            writeLog();
            reject('error');
          }, 1000);
        }
      });
      child.stdout.on('data', chunk => {
        const line = chunk.toString('UTF-8');

        if (!desiredExit && line.trim().replace(/[\n\r\t\v\f]+/gm, '') !== '') {
          const linesToDisplay = line.trim().split('\n\r'); // Only display last line from the chunk.

          const sanitizedLine = linesToDisplay.pop().replace(/[\n\r\t\v\f]+/gm, '');
          sll(sanitizedLine);
        }

        log += `${line}\n`;

        if (~line.indexOf('after_platform_add')) {
          sll('');
          this.log.info('done... 10%');
        }

        if (~line.indexOf('Local package version')) {
          if (messageTimeout) {
            clearTimeout(messageTimeout);
          }

          messageTimeout = setTimeout(() => {
            sll('');
            this.log.info('building in progress...');
          }, 1500);
        }

        if (~line.indexOf('Preparing Cordova project')) {
          sll('');
          this.log.info('done... 60%');
        }

        if (~line.indexOf('Can\'t listen on port')) {
          portProblem = true;
        }

        if (~line.indexOf('Your application has errors')) {
          if (errorTimeout) {
            clearTimeout(errorTimeout);
          }

          errorTimeout = setTimeout(() => {
            clearTimeoutsAndIntervals();
            kill();
            writeLog();
            reject('errorInApp');
          }, 1000);
        }

        if (~line.indexOf('App running at')) {
          copyBuild();
        }
      }); // When Meteor exits

      child.on('exit', () => {
        sll('');
        clearTimeoutsAndIntervals();

        if (!desiredExit) {
          writeLog();

          if (portProblem) {
            reject('port');
          } else {
            reject('exit');
          }
        }
      });
      buildTimeout = setTimeout(() => {
        kill();
        writeLog();
        reject('timeout');
      }, this.$.env.options.buildTimeout ? this.$.env.options.buildTimeout * 1000 : 600000);
    });
  }
  /**
   * Replaces the DDP url that was used originally when Meteor was building the client.
   * @param {string} indexHtml - path to index.html from the client
   */


  updateDdpUrl(indexHtml) {
    let content;
    let runtimeConfig;

    try {
      content = _fs.default.readFileSync(indexHtml, 'UTF-8');
    } catch (e) {
      this.log.error(`error loading index.html file: ${e.message}`);
      process.exit(1);
    }

    if (!this.matcher.test(content)) {
      this.log.error('could not find runtime config in index file');
      process.exit(1);
    }

    try {
      const matches = content.match(this.matcher);
      runtimeConfig = JSON.parse(decodeURIComponent(matches[1]));
    } catch (e) {
      this.log.error('could not find runtime config in index file');
      process.exit(1);
    }

    if (this.$.env.options.ddpUrl.substr(-1, 1) !== '/') {
      this.$.env.options.ddpUrl += '/';
    }

    runtimeConfig.ROOT_URL = this.$.env.options.ddpUrl;
    runtimeConfig.DDP_DEFAULT_CONNECTION_URL = this.$.env.options.ddpUrl;
    content = content.replace(this.replacer, `$1"${encodeURIComponent(JSON.stringify(runtimeConfig))}"$3`);

    try {
      _fs.default.writeFileSync(indexHtml, content);
    } catch (e) {
      this.log.error(`error writing index.html file: ${e.message}`);
      process.exit(1);
    }

    this.log.info('successfully updated ddp string in the runtime config of a mobile build' + ` to ${this.$.env.options.ddpUrl}`);
  }
  /**
   * Prepares the arguments passed to `meteor` command.
   * @returns {string[]}
   */


  prepareArguments() {
    const args = ['run', '--verbose', `--mobile-server=${this.$.env.options.ddpUrl}`];

    if (this.$.env.isProductionBuild()) {
      args.push('--production');
    }

    args.push('-p');

    if (this.$.env.options.port) {
      args.push(this.$.env.options.port);
    } else {
      args.push('3080');
    }

    if (this.$.env.options.meteorSettings) {
      args.push('--settings', this.$.env.options.meteorSettings);
    }

    return args;
  }
  /**
   * Validates the mobile build and copies it into electron app.
   */


  async copyBuild() {
    this.log.debug('clearing build dir');

    try {
      await this.$.utils.rmWithRetries('-rf', this.$.env.paths.electronApp.meteorApp);
    } catch (e) {
      throw new Error(e);
    }

    let prefix = 'cordovaBuild';
    let copyPathPostfix = '';

    if (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER) {
      prefix = 'webCordova';
      copyPathPostfix = `${_path.default.sep}*`;
      let indexHtml;

      try {
        _fs.default.mkdirSync(this.$.env.paths.electronApp.meteorApp);

        indexHtml = await this.acquireIndex();

        _fs.default.writeFileSync(this.$.env.paths.electronApp.meteorAppIndex, indexHtml);

        this.log.info('successfully downloaded index.html from running meteor app');
      } catch (e) {
        this.log.error('error while trying to download index.html for web.cordova, ' + 'be sure that you are running a mobile target or with' + ' --mobile-server: ', e);
        throw e;
      }
    }

    const cordovaBuild = this.$.env.paths.meteorApp[prefix];
    const {
      cordovaBuildIndex
    } = this.$.env.paths.meteorApp;
    const cordovaBuildProgramJson = this.$.env.paths.meteorApp[`${prefix}ProgramJson`];

    if (!this.$.utils.exists(cordovaBuild)) {
      this.log.error(`no mobile build found at ${cordovaBuild}`);
      this.log.error('are you sure you did run meteor with --mobile-server?');
      throw new Error('required file not present');
    }

    if (!this.$.utils.exists(cordovaBuildProgramJson)) {
      this.log.error('no program.json found in mobile build found at ' + `${cordovaBuild}`);
      this.log.error('are you sure you did run meteor with --mobile-server?');
      throw new Error('required file not present');
    }

    if (this.indexHTMLstrategy !== this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER) {
      if (!this.$.utils.exists(cordovaBuildIndex)) {
        this.log.error('no index.html found in cordova build found at ' + `${cordovaBuild}`);
        this.log.error('are you sure you did run meteor with --mobile-server?');
        throw new Error('required file not present');
      }
    }

    this.log.verbose('copying mobile build');

    _shelljs.default.cp('-R', `${cordovaBuild}${copyPathPostfix}`, this.$.env.paths.electronApp.meteorApp); // Because of various permission problems here we try to clear te path by clearing
    // all possible restrictions.


    _shelljs.default.chmod('-R', '777', this.$.env.paths.electronApp.meteorApp);

    if (this.$.env.os.isWindows) {
      _shelljs.default.exec(`attrib -r ${this.$.env.paths.electronApp.meteorApp}${_path.default.sep}*.* /s`);
    }

    if (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER) {
      let programJson;

      try {
        programJson = await this.acquireManifest();

        _fs.default.writeFileSync(this.$.env.paths.electronApp.meteorAppProgramJson, JSON.stringify(programJson, null, 4));

        this.log.info('successfully downloaded manifest.json from running meteor app');
      } catch (e) {
        this.log.error('error while trying to download manifest.json for web.cordova,' + ' be sure that you are running a mobile target or with' + ' --mobile-server: ', e);
        throw e;
      }
    }

    this.log.info('mobile build copied to electron app');
    this.log.debug('copy cordova.js to meteor build');

    _shelljs.default.cp(join(__dirname, '..', 'skeleton', 'cordova.js'), this.$.env.paths.electronApp.meteorApp);
  }
  /**
   * Injects Meteor.isDesktop
   */


  injectIsDesktop() {
    this.log.info('injecting isDesktop');
    let manifestJsonPath = this.$.env.paths.meteorApp.cordovaBuildProgramJson;

    if (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER) {
      manifestJsonPath = this.$.env.paths.meteorApp.webCordovaProgramJson;
    }

    try {
      const {
        manifest
      } = JSON.parse(_fs.default.readFileSync(manifestJsonPath, 'UTF-8'));
      let injected = false;
      let injectedStartupDidComplete = false;
      let result = null; // We will search in every .js file in the manifest.
      // We could probably detect whether this is a dev or production build and only search in
      // the correct files, but for now this should be fine.

      manifest.forEach(file => {
        let fileContents; // Hacky way of setting isDesktop.

        if (file.type === 'js') {
          fileContents = _fs.default.readFileSync(join(this.$.env.paths.electronApp.meteorApp, file.path), 'UTF-8');
          result = this.injector.processFileContents(fileContents);
          ({
            fileContents
          } = result);
          injectedStartupDidComplete = result.injectedStartupDidComplete ? true : injectedStartupDidComplete;
          injected = result.injected ? true : injected;

          _fs.default.writeFileSync(join(this.$.env.paths.electronApp.meteorApp, file.path), fileContents);
        }
      });

      if (!injected) {
        this.log.error('error injecting isDesktop global var.');
        process.exit(1);
      }

      if (!injectedStartupDidComplete) {
        this.log.error('error injecting isDesktop for startupDidComplete');
        process.exit(1);
      }
    } catch (e) {
      this.log.error('error occurred while injecting isDesktop: ', e);
      process.exit(1);
    }

    this.log.info('injected successfully');
  }
  /**
   * Builds, modifies and copies the meteor app to electron app.
   */


  async build() {
    this.log.info('checking for any mobile platform');

    try {
      await this.checkPreconditions();
    } catch (e) {
      this.log.error('error occurred during checking preconditions: ', e);
      process.exit(1);
    }

    this.log.info('building meteor app');

    if (!this.$.env.options.skipMobileBuild) {
      try {
        await this.buildMobileTarget();
      } catch (reason) {
        switch (reason) {
          case 'timeout':
            this.log.error('timeout while building, log has been written to meteor.log');
            break;

          case 'error':
            this.log.error('build was terminated by meteor-desktop as some errors were reported to stderr, you ' + 'should see it above, also check meteor.log for more info, to ignore it use the ' + '--ignore-stderr "<string>"');
            break;

          case 'errorInApp':
            this.log.error('your meteor app has errors - look into meteor.log for more' + ' info');
            break;

          case 'port':
            this.log.error('your port 3080 is currently used (you probably have this or other ' + 'meteor project running?), use `-t` or `--meteor-port` to use ' + 'different port while building');
            break;

          case 'exit':
            this.log.error('meteor cmd exited unexpectedly, log has been written to meteor.log');
            break;

          case 'copy':
            this.log.error('error encountered when copying the build');
            break;

          default:
            this.log.error('error occurred during building mobile target', reason);
        }

        if (this.mobilePlatform) {
          await this.removeMobilePlatform(this.mobilePlatform);
        }

        process.exit(1);
      }
    } else {
      this.indexHTMLstrategy = this.chooseStrategy();

      try {
        await this.copyBuild();
      } catch (e) {
        process.exit(1);
      }
    }

    this.injectIsDesktop();
    this.changeDdpUrl();

    try {
      await this.packToAsar();
    } catch (e) {
      this.log.error('error while packing meteor app to asar');
      process.exit(1);
    }

    this.log.info('meteor build finished');

    if (this.mobilePlatform) {
      await this.removeMobilePlatform(this.mobilePlatform);
    }
  }

  changeDdpUrl() {
    if (this.$.env.options.ddpUrl !== null) {
      try {
        this.updateDdpUrl(this.$.env.paths.electronApp.meteorAppIndex);
      } catch (e) {
        this.log.error(`error while trying to change the ddp url: ${e.message}`);
      }
    }
  }

  packToAsar() {
    this.log.info('packing meteor app to asar archive');
    return new Promise((resolve, reject) => _asar.default.createPackage(this.$.env.paths.electronApp.meteorApp, _path.default.join(this.$.env.paths.electronApp.root, 'meteor.asar')).then(() => {
      // On Windows some files might still be blocked. Giving a tick for them to be
      // ready for deletion.
      setImmediate(() => {
        this.log.verbose('clearing meteor app after packing');
        this.$.utils.rmWithRetries('-rf', this.$.env.paths.electronApp.meteorApp).then(() => {
          resolve();
        }).catch(e => {
          reject(e);
        });
      });
    }));
  }
  /**
   * Wrapper for spawning npm.
   * @param {Array}  commands - commands for spawn
   * @param {string} stdio
   * @param {string} cwd
   * @return {Promise}
   */


  runNpm(commands, stdio = 'ignore', cwd = this.$.env.paths.meteorApp.root) {
    return new Promise((resolve, reject) => {
      this.log.verbose(`executing meteor npm ${commands.join(' ')}`);
      (0, _crossSpawn.default)('meteor', ['npm', ...commands], {
        cwd,
        stdio
      }).on('exit', code => code === 0 ? resolve() : reject(new Error(`npm exit code was ${code}`)));
    });
  }

}

exports.default = MeteorApp;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJqb2luIiwicGF0aCIsInNsbCIsInNpbmdsZUxpbmVMb2ciLCJzdGRvdXQiLCJNZXRlb3JBcHAiLCJjb25zdHJ1Y3RvciIsIiQiLCJsb2ciLCJMb2ciLCJtZXRlb3JNYW5hZ2VyIiwiTWV0ZW9yTWFuYWdlciIsIm1vYmlsZVBsYXRmb3JtIiwib2xkTWFuaWZlc3QiLCJpbmplY3RvciIsIklzRGVza3RvcEluamVjdG9yIiwibWF0Y2hlciIsIlJlZ0V4cCIsInJlcGxhY2VyIiwibWV0ZW9yVmVyc2lvbiIsImluZGV4SFRNTHN0cmF0ZWd5IiwiaW5kZXhIVE1MU3RyYXRlZ2llcyIsIklOREVYX0ZST01fQ09SRE9WQV9CVUlMRCIsIklOREVYX0ZST01fUlVOTklOR19TRVJWRVIiLCJkZXByZWN0YXRlZFBhY2thZ2VzIiwicmVtb3ZlRGVwcmVjYXRlZFBhY2thZ2VzIiwiY2hlY2tQYWNrYWdlcyIsImluZm8iLCJkZWxldGVQYWNrYWdlcyIsImUiLCJFcnJvciIsImVuc3VyZURlc2t0b3BIQ1BQYWNrYWdlcyIsImRlc2t0b3BIQ1BQYWNrYWdlcyIsImRlc2t0b3AiLCJnZXRTZXR0aW5ncyIsImRlc2t0b3BIQ1AiLCJ2ZXJib3NlIiwicGFja2FnZXNXaXRoVmVyc2lvbiIsIm1hcCIsInBhY2thZ2VOYW1lIiwiZ2V0VmVyc2lvbiIsImVuc3VyZVBhY2thZ2VzIiwidXBkYXRlR2l0SWdub3JlIiwiZ2l0SWdub3JlIiwiZnMiLCJyZWFkRmlsZVN5bmMiLCJlbnYiLCJwYXRocyIsIm1ldGVvckFwcCIsInNwbGl0IiwiZmlsdGVyIiwiaWdub3JlZFBhdGgiLCJ0cmltIiwiaW5kZXhPZiIsImVsZWN0cm9uQXBwIiwicm9vdE5hbWUiLCJwdXNoIiwid3JpdGVGaWxlU3luYyIsImdldE1ldGVvclJlbGVhc2UiLCJyZWxlYXNlIiwicmVwbGFjZSIsImNhc3RNZXRlb3JSZWxlYXNlVG9TZW12ZXIiLCJtYXRjaCIsImNoZWNrTWV0ZW9yVmVyc2lvbiIsInZlcnNpb25SYW5nZSIsInNlbXZlciIsInNhdGlzZmllcyIsIm9wdGlvbnMiLCJza2lwTW9iaWxlQnVpbGQiLCJlcnJvciIsInByb2Nlc3MiLCJleGl0IiwiY2hvb3NlU3RyYXRlZ3kiLCJmb3JjZUNvcmRvdmFCdWlsZCIsImV4cGxvZGVkVmVyc2lvbiIsImxlbmd0aCIsImNoZWNrUHJlY29uZGl0aW9ucyIsImRlYnVnIiwicGxhdGZvcm1zIiwiYW5kcm9pZCIsIndhcm4iLCJhZGRNb2JpbGVQbGF0Zm9ybSIsInBsYXRmb3JtIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJzcGF3biIsImN3ZCIsInJvb3QiLCJzdGRpbyIsIm9uIiwicmVtb3ZlTW9iaWxlUGxhdGZvcm0iLCJza2lwUmVtb3ZlTW9iaWxlUGxhdGZvcm0iLCJPYmplY3QiLCJhc3NpZ24iLCJNRVRFT1JfUFJFVFRZX09VVFBVVCIsImlzQ29yZG92YUJ1aWxkUmVhZHkiLCJ1dGlscyIsImV4aXN0cyIsImNvcmRvdmFCdWlsZEluZGV4IiwiY29yZG92YUJ1aWxkUHJvZ3JhbUpzb24iLCJ3ZWJDb3Jkb3ZhUHJvZ3JhbUpzb24iLCJhY3F1aXJlSW5kZXgiLCJwb3J0IiwicmVzIiwiZmV0Y2giLCJ0ZXh0IiwiYWNxdWlyZU1hbmlmZXN0IiwiSlNPTiIsInBhcnNlIiwiYnVpbGRNb2JpbGVUYXJnZXQiLCJwcm9ncmFtSnNvbiIsInNlbGYiLCJkZXNpcmVkRXhpdCIsImJ1aWxkVGltZW91dCIsImVycm9yVGltZW91dCIsIm1lc3NhZ2VUaW1lb3V0Iiwia2lsbFRpbWVvdXQiLCJjb3Jkb3ZhQ2hlY2tJbnRlcnZhbCIsInBvcnRQcm9ibGVtIiwid2luZG93c0tpbGwiLCJwaWQiLCJzeW5jIiwib3V0IiwidG9TdHJpbmciLCJhcmdzIiwicHJlcGFyZUFyZ3VtZW50cyIsInJlZ2V4VjEiLCJyZWdleFYyIiwiZm9yRWFjaCIsImxpbmUiLCJleGVjIiwibGFzdEluZGV4Iiwid3JpdGVMb2ciLCJjbGVhclRpbWVvdXRzQW5kSW50ZXJ2YWxzIiwiY2xlYXJJbnRlcnZhbCIsImNsZWFyVGltZW91dCIsIk1FVEVPUl9OT19SRUxFQVNFX0NIRUNLIiwicHJvZERlYnVnIiwiTUVURU9SX0RFU0tPUF9QUk9EX0RFQlVHIiwiY2hpbGQiLCJzaGVsbCIsImtpbGwiLCJvcyIsImlzV2luZG93cyIsInNldFRpbWVvdXQiLCJjb3B5QnVpbGQiLCJ0aGVuIiwiY2F0Y2giLCJzZXRJbnRlcnZhbCIsInN0ZGVyciIsImNodW5rIiwiQXJyYXkiLCJpc0FycmF5IiwiaWdub3JlU3RkZXJyIiwiZXZlcnkiLCJzdHIiLCJsaW5lc1RvRGlzcGxheSIsInNhbml0aXplZExpbmUiLCJwb3AiLCJ1cGRhdGVEZHBVcmwiLCJpbmRleEh0bWwiLCJjb250ZW50IiwicnVudGltZUNvbmZpZyIsIm1lc3NhZ2UiLCJ0ZXN0IiwibWF0Y2hlcyIsImRlY29kZVVSSUNvbXBvbmVudCIsImRkcFVybCIsInN1YnN0ciIsIlJPT1RfVVJMIiwiRERQX0RFRkFVTFRfQ09OTkVDVElPTl9VUkwiLCJlbmNvZGVVUklDb21wb25lbnQiLCJzdHJpbmdpZnkiLCJpc1Byb2R1Y3Rpb25CdWlsZCIsIm1ldGVvclNldHRpbmdzIiwicm1XaXRoUmV0cmllcyIsInByZWZpeCIsImNvcHlQYXRoUG9zdGZpeCIsInNlcCIsIm1rZGlyU3luYyIsIm1ldGVvckFwcEluZGV4IiwiY29yZG92YUJ1aWxkIiwiY3AiLCJjaG1vZCIsIm1ldGVvckFwcFByb2dyYW1Kc29uIiwiX19kaXJuYW1lIiwiaW5qZWN0SXNEZXNrdG9wIiwibWFuaWZlc3RKc29uUGF0aCIsIm1hbmlmZXN0IiwiaW5qZWN0ZWQiLCJpbmplY3RlZFN0YXJ0dXBEaWRDb21wbGV0ZSIsInJlc3VsdCIsImZpbGUiLCJmaWxlQ29udGVudHMiLCJ0eXBlIiwicHJvY2Vzc0ZpbGVDb250ZW50cyIsImJ1aWxkIiwicmVhc29uIiwiY2hhbmdlRGRwVXJsIiwicGFja1RvQXNhciIsImFzYXIiLCJjcmVhdGVQYWNrYWdlIiwic2V0SW1tZWRpYXRlIiwicnVuTnBtIiwiY29tbWFuZHMiLCJjb2RlIl0sInNvdXJjZXMiOlsiLi4vbGliL21ldGVvckFwcC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdW51c2VkLXZhcnNcbmltcG9ydCByZWdlbmVyYXRvclJ1bnRpbWUgZnJvbSAncmVnZW5lcmF0b3ItcnVudGltZS9ydW50aW1lJztcbmltcG9ydCBmcyBmcm9tICdmcyc7XG5pbXBvcnQgc3Bhd24gZnJvbSAnY3Jvc3Mtc3Bhd24nO1xuaW1wb3J0IHNlbXZlciBmcm9tICdzZW12ZXInO1xuaW1wb3J0IHNoZWxsIGZyb20gJ3NoZWxsanMnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgc2luZ2xlTGluZUxvZyBmcm9tICdzaW5nbGUtbGluZS1sb2cnO1xuaW1wb3J0IGFzYXIgZnJvbSAnQGVsZWN0cm9uL2FzYXInO1xuaW1wb3J0IGZldGNoIGZyb20gJ25vZGUtZmV0Y2gnO1xuXG5pbXBvcnQgSXNEZXNrdG9wSW5qZWN0b3IgZnJvbSAnLi4vc2tlbGV0b24vbW9kdWxlcy9hdXRvdXBkYXRlL2lzRGVza3RvcEluamVjdG9yJztcbmltcG9ydCBMb2cgZnJvbSAnLi9sb2cnO1xuaW1wb3J0IE1ldGVvck1hbmFnZXIgZnJvbSAnLi9tZXRlb3JNYW5hZ2VyJztcblxuY29uc3QgeyBqb2luIH0gPSBwYXRoO1xuY29uc3Qgc2xsID0gc2luZ2xlTGluZUxvZy5zdGRvdXQ7XG5cbi8vIFRPRE86IHJlZmFjdG9yIGFsbCBzdHJhdGVneSBpZnMgdG8gb25lIHBsYWNlXG5cbi8qKlxuICogUmVwcmVzZW50cyB0aGUgTWV0ZW9yIGFwcC5cbiAqIEBwcm9wZXJ0eSB7TWV0ZW9yRGVza3RvcH0gJFxuICogQGNsYXNzXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1ldGVvckFwcCB7XG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtNZXRlb3JEZXNrdG9wfSAkIC0gY29udGV4dFxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKCQpIHtcbiAgICAgICAgdGhpcy5sb2cgPSBuZXcgTG9nKCdtZXRlb3JBcHAnKTtcbiAgICAgICAgdGhpcy4kID0gJDtcbiAgICAgICAgdGhpcy5tZXRlb3JNYW5hZ2VyID0gbmV3IE1ldGVvck1hbmFnZXIoJCk7XG4gICAgICAgIHRoaXMubW9iaWxlUGxhdGZvcm0gPSBudWxsO1xuICAgICAgICB0aGlzLm9sZE1hbmlmZXN0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5pbmplY3RvciA9IG5ldyBJc0Rlc2t0b3BJbmplY3RvcigpO1xuICAgICAgICB0aGlzLm1hdGNoZXIgPSBuZXcgUmVnRXhwKFxuICAgICAgICAgICAgJ19fbWV0ZW9yX3J1bnRpbWVfY29uZmlnX18gPSBKU09OLnBhcnNlXFxcXChkZWNvZGVVUklDb21wb25lbnRcXFxcKFwiKFteXCJdKilcIlxcXFwpXFxcXCknXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMucmVwbGFjZXIgPSBuZXcgUmVnRXhwKFxuICAgICAgICAgICAgJyhfX21ldGVvcl9ydW50aW1lX2NvbmZpZ19fID0gSlNPTi5wYXJzZVxcXFwoZGVjb2RlVVJJQ29tcG9uZW50XFxcXCgpXCIoW15cIl0qKVwiKFxcXFwpXFxcXCkpJ1xuICAgICAgICApO1xuICAgICAgICB0aGlzLm1ldGVvclZlcnNpb24gPSBudWxsO1xuICAgICAgICB0aGlzLmluZGV4SFRNTHN0cmF0ZWd5ID0gbnVsbDtcblxuICAgICAgICB0aGlzLmluZGV4SFRNTFN0cmF0ZWdpZXMgPSB7XG4gICAgICAgICAgICBJTkRFWF9GUk9NX0NPUkRPVkFfQlVJTEQ6IDEsXG4gICAgICAgICAgICBJTkRFWF9GUk9NX1JVTk5JTkdfU0VSVkVSOiAyXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kZXByZWN0YXRlZFBhY2thZ2VzID0gWydvbWVnYTptZXRlb3ItZGVza3RvcC1sb2NhbHN0b3JhZ2UnXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYW55IGRlcHJlY2F0ZWQgcGFja2FnZXMgZnJvbSBtZXRlb3IgcHJvamVjdC5cbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn1cbiAgICAgKi9cbiAgICBhc3luYyByZW1vdmVEZXByZWNhdGVkUGFja2FnZXMoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAodGhpcy5tZXRlb3JNYW5hZ2VyLmNoZWNrUGFja2FnZXModGhpcy5kZXByZWN0YXRlZFBhY2thZ2VzKSkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9nLmluZm8oJ2RlcHJlY2F0ZWQgbWV0ZW9yIHBsdWdpbnMgZm91bmQsIHJlbW92aW5nIHRoZW0nKTtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLm1ldGVvck1hbmFnZXIuZGVsZXRlUGFja2FnZXModGhpcy5kZXByZWN0YXRlZFBhY2thZ2VzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW5zdXJlcyB0aGF0IHJlcXVpcmVkIHBhY2thZ2VzIGFyZSBhZGRlZCB0byB0aGUgTWV0ZW9yIGFwcC5cbiAgICAgKi9cbiAgICBhc3luYyBlbnN1cmVEZXNrdG9wSENQUGFja2FnZXMoKSB7XG4gICAgICAgIGNvbnN0IGRlc2t0b3BIQ1BQYWNrYWdlcyA9IFsnY29tbXVuaXR5cGFja2FnZXM6bWV0ZW9yLWRlc2t0b3Atd2F0Y2hlcicsICdjb21tdW5pdHlwYWNrYWdlczptZXRlb3ItZGVza3RvcC1idW5kbGVyJ107XG4gICAgICAgIGlmICh0aGlzLiQuZGVza3RvcC5nZXRTZXR0aW5ncygpLmRlc2t0b3BIQ1ApIHtcbiAgICAgICAgICAgIHRoaXMubG9nLnZlcmJvc2UoJ2Rlc2t0b3BIQ1AgaXMgZW5hYmxlZCwgY2hlY2tpbmcgZm9yIHJlcXVpcmVkIHBhY2thZ2VzJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHBhY2thZ2VzV2l0aFZlcnNpb24gPSBkZXNrdG9wSENQUGFja2FnZXMubWFwKHBhY2thZ2VOYW1lID0+IGAke3BhY2thZ2VOYW1lfUAke3RoaXMuJC5nZXRWZXJzaW9uKCl9YCk7XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5tZXRlb3JNYW5hZ2VyLmVuc3VyZVBhY2thZ2VzKGRlc2t0b3BIQ1BQYWNrYWdlcywgcGFja2FnZXNXaXRoVmVyc2lvbiwgJ2Rlc2t0b3BIQ1AnKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmxvZy52ZXJib3NlKCdkZXNrdG9wSENQIGlzIG5vdCBlbmFibGVkLCByZW1vdmluZyByZXF1aXJlZCBwYWNrYWdlcycpO1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLm1ldGVvck1hbmFnZXIuY2hlY2tQYWNrYWdlcyhkZXNrdG9wSENQUGFja2FnZXMpKSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMubWV0ZW9yTWFuYWdlci5kZWxldGVQYWNrYWdlcyhkZXNrdG9wSENQUGFja2FnZXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGVudHJ5IHRvIC5tZXRlb3IvLmdpdGlnbm9yZSBpZiBuZWNlc3NhcnkuXG4gICAgICovXG4gICAgdXBkYXRlR2l0SWdub3JlKCkge1xuICAgICAgICB0aGlzLmxvZy52ZXJib3NlKCd1cGRhdGluZyAubWV0ZW9yLy5naXRpZ25vcmUnKTtcbiAgICAgICAgLy8gTGV0cyByZWFkIHRoZSAubWV0ZW9yLy5naXRpZ25vcmUgYW5kIGZpbHRlciBvdXQgYmxhbmsgbGluZXMuXG4gICAgICAgIGNvbnN0IGdpdElnbm9yZSA9IGZzLnJlYWRGaWxlU3luYyh0aGlzLiQuZW52LnBhdGhzLm1ldGVvckFwcC5naXRJZ25vcmUsICdVVEYtOCcpXG4gICAgICAgICAgICAuc3BsaXQoJ1xcbicpLmZpbHRlcihpZ25vcmVkUGF0aCA9PiBpZ25vcmVkUGF0aC50cmltKCkgIT09ICcnKTtcblxuICAgICAgICBpZiAoIX5naXRJZ25vcmUuaW5kZXhPZih0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLnJvb3ROYW1lKSkge1xuICAgICAgICAgICAgdGhpcy5sb2cudmVyYm9zZShgYWRkaW5nICR7dGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5yb290TmFtZX0gdG8gLm1ldGVvci8uZ2l0aWdub3JlYCk7XG4gICAgICAgICAgICBnaXRJZ25vcmUucHVzaCh0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLnJvb3ROYW1lKTtcblxuICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyh0aGlzLiQuZW52LnBhdGhzLm1ldGVvckFwcC5naXRJZ25vcmUsIGdpdElnbm9yZS5qb2luKCdcXG4nKSwgJ1VURi04Jyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZWFkcyB0aGUgTWV0ZW9yIHJlbGVhc2UgdmVyc2lvbiB1c2VkIGluIHRoZSBhcHAuXG4gICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAgKi9cbiAgICBnZXRNZXRlb3JSZWxlYXNlKCkge1xuICAgICAgICBsZXQgcmVsZWFzZSA9IGZzLnJlYWRGaWxlU3luYyh0aGlzLiQuZW52LnBhdGhzLm1ldGVvckFwcC5yZWxlYXNlLCAnVVRGLTgnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nbSwgJycpXG4gICAgICAgICAgICAuc3BsaXQoJ1xcbicpWzBdO1xuICAgICAgICAoWywgcmVsZWFzZV0gPSByZWxlYXNlLnNwbGl0KCdAJykpO1xuICAgICAgICAvLyBXZSBkbyBub3QgY2FyZSBpZiBpdCBpcyBiZXRhLlxuICAgICAgICBpZiAofnJlbGVhc2UuaW5kZXhPZignLScpKSB7XG4gICAgICAgICAgICAoW3JlbGVhc2VdID0gcmVsZWFzZS5zcGxpdCgnLScpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVsZWFzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYXN0IE1ldGVvciByZWxlYXNlIHRvIHNlbXZlciB2ZXJzaW9uLlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICovXG4gICAgY2FzdE1ldGVvclJlbGVhc2VUb1NlbXZlcigpIHtcbiAgICAgICAgcmV0dXJuIGAke3RoaXMuZ2V0TWV0ZW9yUmVsZWFzZSgpfS4wLjBgLm1hdGNoKC8oXlxcZCtcXC5cXGQrXFwuXFxkKykvZ21pKVswXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBWYWxpZGF0ZSBtZXRlb3IgdmVyc2lvbiBhZ2FpbnN0IGEgdmVyc2lvblJhbmdlLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uUmFuZ2UgLSBzZW12ZXIgdmVyc2lvbiByYW5nZVxuICAgICAqL1xuICAgIGNoZWNrTWV0ZW9yVmVyc2lvbih2ZXJzaW9uUmFuZ2UpIHtcbiAgICAgICAgY29uc3QgcmVsZWFzZSA9IHRoaXMuY2FzdE1ldGVvclJlbGVhc2VUb1NlbXZlcigpO1xuICAgICAgICBpZiAoIXNlbXZlci5zYXRpc2ZpZXMocmVsZWFzZSwgdmVyc2lvblJhbmdlKSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJC5lbnYub3B0aW9ucy5za2lwTW9iaWxlQnVpbGQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy5lcnJvcihgd3JvbmcgbWV0ZW9yIHZlcnNpb24gKCR7cmVsZWFzZX0pIGluIHByb2plY3QgLSBvbmx5IGAgK1xuICAgICAgICAgICAgICAgICAgICBgJHt2ZXJzaW9uUmFuZ2V9IGlzIHN1cHBvcnRlZGApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy5lcnJvcihgd3JvbmcgbWV0ZW9yIHZlcnNpb24gKCR7cmVsZWFzZX0pIGluIHByb2plY3QgLSBvbmx5IGAgK1xuICAgICAgICAgICAgICAgICAgICBgJHt2ZXJzaW9uUmFuZ2V9IGlzIHN1cHBvcnRlZCBmb3IgYXV0b21hdGljIG1ldGVvciBidWlsZHMgKHlvdSBjYW4gYWx3YXlzIGAgK1xuICAgICAgICAgICAgICAgICAgICAndHJ5IHdpdGggYC0tc2tpcC1tb2JpbGUtYnVpbGRgIGlmIHlvdSBhcmUgdXNpbmcgbWV0ZW9yID49IDEuMi4xJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZWNpZGVzIHdoaWNoIHN0cmF0ZWd5IHRvIHVzZSB3aGlsZSB0cnlpbmcgdG8gZ2V0IGNsaWVudCBidWlsZCBvdXQgb2YgTWV0ZW9yIHByb2plY3QuXG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBjaG9vc2VTdHJhdGVneSgpIHtcbiAgICAgICAgaWYgKHRoaXMuJC5lbnYub3B0aW9ucy5mb3JjZUNvcmRvdmFCdWlsZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaW5kZXhIVE1MU3RyYXRlZ2llcy5JTkRFWF9GUk9NX0NPUkRPVkFfQlVJTEQ7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZWxlYXNlID0gdGhpcy5jYXN0TWV0ZW9yUmVsZWFzZVRvU2VtdmVyKCk7XG4gICAgICAgIGlmIChzZW12ZXIuc2F0aXNmaWVzKHJlbGVhc2UsICc+IDEuMy40JykpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmluZGV4SFRNTFN0cmF0ZWdpZXMuSU5ERVhfRlJPTV9SVU5OSU5HX1NFUlZFUjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2VtdmVyLnNhdGlzZmllcyhyZWxlYXNlLCAnMS4zLjQnKSkge1xuICAgICAgICAgICAgY29uc3QgZXhwbG9kZWRWZXJzaW9uID0gdGhpcy5nZXRNZXRlb3JSZWxlYXNlKCkuc3BsaXQoJy4nKTtcbiAgICAgICAgICAgIGlmIChleHBsb2RlZFZlcnNpb24ubGVuZ3RoID49IDQpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXhwbG9kZWRWZXJzaW9uWzNdID4gMSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pbmRleEhUTUxTdHJhdGVnaWVzLklOREVYX0ZST01fUlVOTklOR19TRVJWRVI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmluZGV4SFRNTFN0cmF0ZWdpZXMuSU5ERVhfRlJPTV9DT1JET1ZBX0JVSUxEO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmluZGV4SFRNTFN0cmF0ZWdpZXMuSU5ERVhfRlJPTV9DT1JET1ZBX0JVSUxEO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrcyByZXF1aXJlZCBwcmVjb25kaXRpb25zLlxuICAgICAqIC0gTWV0ZW9yIHZlcnNpb25cbiAgICAgKiAtIGlzIG1vYmlsZSBwbGF0Zm9ybSBhZGRlZFxuICAgICAqL1xuICAgIGFzeW5jIGNoZWNrUHJlY29uZGl0aW9ucygpIHtcbiAgICAgICAgaWYgKHRoaXMuJC5lbnYub3B0aW9ucy5za2lwTW9iaWxlQnVpbGQpIHtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tNZXRlb3JWZXJzaW9uKCc+PSAxLjIuMScpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jaGVja01ldGVvclZlcnNpb24oJz49IDEuMy4zJyk7XG4gICAgICAgICAgICB0aGlzLmluZGV4SFRNTHN0cmF0ZWd5ID0gdGhpcy5jaG9vc2VTdHJhdGVneSgpO1xuICAgICAgICAgICAgaWYgKHRoaXMuaW5kZXhIVE1Mc3RyYXRlZ3kgPT09IHRoaXMuaW5kZXhIVE1MU3RyYXRlZ2llcy5JTkRFWF9GUk9NX0NPUkRPVkFfQlVJTEQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy5kZWJ1ZyhcbiAgICAgICAgICAgICAgICAgICAgJ21ldGVvciB2ZXJzaW9uIGlzIDwgMS4zLjQuMiBzbyB0aGUgaW5kZXguaHRtbCBmcm9tIGNvcmRvdmEtYnVpbGQgd2lsbCcgK1xuICAgICAgICAgICAgICAgICAgICAnIGJlIHVzZWQnXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2cuZGVidWcoXG4gICAgICAgICAgICAgICAgICAgICdtZXRlb3IgdmVyc2lvbiBpcyA+PSAxLjMuNC4yIHNvIHRoZSBpbmRleC5odG1sIHdpbGwgYmUgZG93bmxvYWRlZCAnICtcbiAgICAgICAgICAgICAgICAgICAgJ2Zyb20gX19jb3Jkb3ZhL2luZGV4Lmh0bWwnXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy4kLmVudi5vcHRpb25zLnNraXBNb2JpbGVCdWlsZCkge1xuICAgICAgICAgICAgY29uc3QgcGxhdGZvcm1zID0gZnMucmVhZEZpbGVTeW5jKHRoaXMuJC5lbnYucGF0aHMubWV0ZW9yQXBwLnBsYXRmb3JtcywgJ1VURi04Jyk7XG4gICAgICAgICAgICBpZiAoIX5wbGF0Zm9ybXMuaW5kZXhPZignYW5kcm9pZCcpICYmICF+cGxhdGZvcm1zLmluZGV4T2YoJ2lvcycpKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLiQuZW52Lm9wdGlvbnMuYW5kcm9pZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm1vYmlsZVBsYXRmb3JtID0gJ2lvcyc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tb2JpbGVQbGF0Zm9ybSA9ICdhbmRyb2lkJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5sb2cud2Fybihgbm8gbW9iaWxlIHRhcmdldCBkZXRlY3RlZCAtIHdpbGwgYWRkICcke3RoaXMubW9iaWxlUGxhdGZvcm19JyBgICtcbiAgICAgICAgICAgICAgICAgICAgJ2p1c3QgdG8gZ2V0IGEgbW9iaWxlIGJ1aWxkJyk7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hZGRNb2JpbGVQbGF0Zm9ybSh0aGlzLm1vYmlsZVBsYXRmb3JtKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKCdmYWlsZWQgdG8gYWRkIGEgbW9iaWxlIHBsYXRmb3JtIC0gcGxlYXNlIHRyeSB0byBkbyBpdCBtYW51YWxseScpO1xuICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZXMgdG8gYWRkIGEgbW9iaWxlIHBsYXRmb3JtIHRvIG1ldGVvciBwcm9qZWN0LlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBwbGF0Zm9ybSAtIHBsYXRmb3JtIHRvIGFkZFxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgICAqL1xuICAgIGFkZE1vYmlsZVBsYXRmb3JtKHBsYXRmb3JtKSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmxvZy52ZXJib3NlKGBhZGRpbmcgbW9iaWxlIHBsYXRmb3JtOiAke3BsYXRmb3JtfWApO1xuICAgICAgICAgICAgc3Bhd24oJ21ldGVvcicsIFsnYWRkLXBsYXRmb3JtJywgcGxhdGZvcm1dLCB7XG4gICAgICAgICAgICAgICAgY3dkOiB0aGlzLiQuZW52LnBhdGhzLm1ldGVvckFwcC5yb290LFxuICAgICAgICAgICAgICAgIHN0ZGlvOiB0aGlzLiQuZW52LnN0ZGlvXG4gICAgICAgICAgICB9KS5vbignZXhpdCcsICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwbGF0Zm9ybXMgPSBmcy5yZWFkRmlsZVN5bmModGhpcy4kLmVudi5wYXRocy5tZXRlb3JBcHAucGxhdGZvcm1zLCAnVVRGLTgnKTtcbiAgICAgICAgICAgICAgICBpZiAoIX5wbGF0Zm9ybXMuaW5kZXhPZignYW5kcm9pZCcpICYmICF+cGxhdGZvcm1zLmluZGV4T2YoJ2lvcycpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdCgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZXMgdG8gcmVtb3ZlIGEgbW9iaWxlIHBsYXRmb3JtIGZyb20gbWV0ZW9yIHByb2plY3QuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHBsYXRmb3JtIC0gcGxhdGZvcm0gdG8gcmVtb3ZlXG4gICAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAgICovXG4gICAgcmVtb3ZlTW9iaWxlUGxhdGZvcm0ocGxhdGZvcm0pIHtcbiAgICAgICAgaWYgKHRoaXMuJC5lbnYub3B0aW9ucy5za2lwUmVtb3ZlTW9iaWxlUGxhdGZvcm0pIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5sb2cudmVyYm9zZShgcmVtb3ZpbmcgbW9iaWxlIHBsYXRmb3JtOiAke3BsYXRmb3JtfWApO1xuICAgICAgICAgICAgc3Bhd24oJ21ldGVvcicsIFsncmVtb3ZlLXBsYXRmb3JtJywgcGxhdGZvcm1dLCB7XG4gICAgICAgICAgICAgICAgY3dkOiB0aGlzLiQuZW52LnBhdGhzLm1ldGVvckFwcC5yb290LFxuICAgICAgICAgICAgICAgIHN0ZGlvOiB0aGlzLiQuZW52LnN0ZGlvLFxuICAgICAgICAgICAgICAgIGVudjogT2JqZWN0LmFzc2lnbih7IE1FVEVPUl9QUkVUVFlfT1VUUFVUOiAwIH0sIHByb2Nlc3MuZW52KVxuICAgICAgICAgICAgfSkub24oJ2V4aXQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGxhdGZvcm1zID0gZnMucmVhZEZpbGVTeW5jKHRoaXMuJC5lbnYucGF0aHMubWV0ZW9yQXBwLnBsYXRmb3JtcywgJ1VURi04Jyk7XG4gICAgICAgICAgICAgICAgaWYgKH5wbGF0Zm9ybXMuaW5kZXhPZihwbGF0Zm9ybSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBKdXN0IGNoZWNrcyBmb3IgaW5kZXguaHRtbCBhbmQgcHJvZ3JhbS5qc29uIGV4aXN0ZW5jZS5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBpc0NvcmRvdmFCdWlsZFJlYWR5KCkge1xuICAgICAgICBpZiAodGhpcy5pbmRleEhUTUxzdHJhdGVneSA9PT0gdGhpcy5pbmRleEhUTUxTdHJhdGVnaWVzLklOREVYX0ZST01fQ09SRE9WQV9CVUlMRCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJC51dGlscy5leGlzdHModGhpcy4kLmVudi5wYXRocy5tZXRlb3JBcHAuY29yZG92YUJ1aWxkSW5kZXgpICYmXG4gICAgICAgICAgICAgICAgdGhpcy4kLnV0aWxzLmV4aXN0cyh0aGlzLiQuZW52LnBhdGhzLm1ldGVvckFwcC5jb3Jkb3ZhQnVpbGRQcm9ncmFtSnNvbikgJiZcbiAgICAgICAgICAgICAgICAoXG4gICAgICAgICAgICAgICAgICAgICF0aGlzLm9sZE1hbmlmZXN0IHx8XG4gICAgICAgICAgICAgICAgICAgICh0aGlzLm9sZE1hbmlmZXN0ICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9sZE1hbmlmZXN0ICE9PSBmcy5yZWFkRmlsZVN5bmMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5tZXRlb3JBcHAuY29yZG92YUJ1aWxkUHJvZ3JhbUpzb24sICdVVEYtOCdcbiAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuJC51dGlscy5leGlzdHModGhpcy4kLmVudi5wYXRocy5tZXRlb3JBcHAud2ViQ29yZG92YVByb2dyYW1Kc29uKSAmJlxuICAgICAgICAgICAgKFxuICAgICAgICAgICAgICAgICF0aGlzLm9sZE1hbmlmZXN0IHx8XG4gICAgICAgICAgICAgICAgKHRoaXMub2xkTWFuaWZlc3QgJiZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vbGRNYW5pZmVzdCAhPT0gZnMucmVhZEZpbGVTeW5jKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5tZXRlb3JBcHAud2ViQ29yZG92YVByb2dyYW1Kc29uLCAnVVRGLTgnXG4gICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZldGNoZXMgaW5kZXguaHRtbCBmcm9tIHJ1bm5pbmcgcHJvamVjdC5cbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZS48Kj59XG4gICAgICovXG4gICAgYXN5bmMgYWNxdWlyZUluZGV4KCkge1xuICAgICAgICBjb25zdCBwb3J0ID0gKHRoaXMuJC5lbnYub3B0aW9ucy5wb3J0KSA/IHRoaXMuJC5lbnYub3B0aW9ucy5wb3J0IDogMzA4MDtcbiAgICAgICAgdGhpcy5sb2cuaW5mbygnYWNxdWlyaW5nIGluZGV4Lmh0bWwnKTtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goYGh0dHA6Ly8xMjcuMC4wLjE6JHtwb3J0fS9fX2NvcmRvdmEvaW5kZXguaHRtbGApO1xuICAgICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgcmVzLnRleHQoKTtcbiAgICAgICAgLy8gU2ltcGxlIHRlc3QgaWYgd2UgcmVhbGx5IGRvd25sb2FkIGluZGV4Lmh0bWwgZm9yIHdlYi5jb3Jkb3ZhLlxuICAgICAgICBpZiAofnRleHQuaW5kZXhPZignc3JjPVwiL2NvcmRvdmEuanNcIicpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGV4dDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmV0Y2hlcyBtYWluZmVzdC5qc29uIGZyb20gcnVubmluZyBwcm9qZWN0LlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlLjx2b2lkPn1cbiAgICAgKi9cbiAgICBhc3luYyBhY3F1aXJlTWFuaWZlc3QoKSB7XG4gICAgICAgIGNvbnN0IHBvcnQgPSAodGhpcy4kLmVudi5vcHRpb25zLnBvcnQpID8gdGhpcy4kLmVudi5vcHRpb25zLnBvcnQgOiAzMDgwO1xuICAgICAgICB0aGlzLmxvZy5pbmZvKCdhY3F1aXJpbmcgbWFuaWZlc3QuanNvbicpO1xuICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChcbiAgICAgICAgICAgIGBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH0vX19jb3Jkb3ZhL21hbmlmZXN0Lmpzb24/bWV0ZW9yX2RvbnRfc2VydmVfaW5kZXg9dHJ1ZWBcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgdGV4dCA9IGF3YWl0IHJlcy50ZXh0KCk7XG4gICAgICAgIHJldHVybiBKU09OLnBhcnNlKHRleHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyaWVzIHRvIGdldCBhIG1vYmlsZSBidWlsZCBmcm9tIG1ldGVvciBhcHAuXG4gICAgICogSW4gY2FzZSBvZiBmYWlsdXJlIGxlYXZlcyBhIG1ldGVvci5sb2cuXG4gICAgICogQSBsb3Qgb2Ygc3R1ZmYgaXMgaGFwcGVuaW5nIGhlcmUgLSBidXQgdGhlIG1haW4gYWltIGlzIHRvIGdldCBhIG1vYmlsZSBidWlsZCBmcm9tXG4gICAgICogLm1ldGVvci9sb2NhbC9jb3Jkb3ZhLWJ1aWxkL3d3dy9hcHBsaWNhdGlvbiBhbmQgZXhpdCBhcyBzb29uIGFzIHBvc3NpYmxlLlxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAgICovXG4gICAgYnVpbGRNb2JpbGVUYXJnZXQoKSB7XG4gICAgICAgIGNvbnN0IHByb2dyYW1Kc29uID1cbiAgICAgICAgICAgICh0aGlzLmluZGV4SFRNTHN0cmF0ZWd5ID09PSB0aGlzLmluZGV4SFRNTFN0cmF0ZWdpZXMuSU5ERVhfRlJPTV9DT1JET1ZBX0JVSUxEKSA/XG4gICAgICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5tZXRlb3JBcHAuY29yZG92YUJ1aWxkUHJvZ3JhbUpzb24gOlxuICAgICAgICAgICAgICAgIHRoaXMuJC5lbnYucGF0aHMubWV0ZW9yQXBwLndlYkNvcmRvdmFQcm9ncmFtSnNvbjtcblxuICAgICAgICBpZiAodGhpcy4kLnV0aWxzLmV4aXN0cyhwcm9ncmFtSnNvbikpIHtcbiAgICAgICAgICAgIHRoaXMub2xkTWFuaWZlc3QgPSBmcy5yZWFkRmlsZVN5bmMocHJvZ3JhbUpzb24sICdVVEYtOCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgbGV0IGxvZyA9ICcnO1xuICAgICAgICAgICAgbGV0IGRlc2lyZWRFeGl0ID0gZmFsc2U7XG4gICAgICAgICAgICBsZXQgYnVpbGRUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAgIGxldCBlcnJvclRpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgbGV0IG1lc3NhZ2VUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAgIGxldCBraWxsVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICBsZXQgY29yZG92YUNoZWNrSW50ZXJ2YWwgPSBudWxsO1xuICAgICAgICAgICAgbGV0IHBvcnRQcm9ibGVtID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHdpbmRvd3NLaWxsKHBpZCkge1xuICAgICAgICAgICAgICAgIHNlbGYubG9nLmRlYnVnKGBraWxsaW5nIHBpZDogJHtwaWR9YCk7XG4gICAgICAgICAgICAgICAgc3Bhd24uc3luYygndGFza2tpbGwnLCBbJy9waWQnLCBwaWQsICcvZicsICcvdCddKTtcblxuICAgICAgICAgICAgICAgIC8vIFdlIHdpbGwgbG9vayBmb3Igb3RoZXIgcHJvY2VzcyB3aGljaCBtaWdodCBoYXZlIGJlZW4gY3JlYXRlZCBvdXRzaWRlIHRoZVxuICAgICAgICAgICAgICAgIC8vIHByb2Nlc3MgdHJlZS5cbiAgICAgICAgICAgICAgICAvLyBMZXRzIGxpc3QgYWxsIG5vZGUuZXhlIHByb2Nlc3Nlcy5cblxuICAgICAgICAgICAgICAgIGNvbnN0IG91dCA9IHNwYXduXG4gICAgICAgICAgICAgICAgICAgIC5zeW5jKFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3dtaWMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgWydwcm9jZXNzJywgJ3doZXJlJywgJ2NhcHRpb249XCJub2RlLmV4ZVwiJywgJ2dldCcsICdjb21tYW5kbGluZSxwcm9jZXNzaWQnXVxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgIC5zdGRvdXQudG9TdHJpbmcoJ3V0Zi04JylcbiAgICAgICAgICAgICAgICAgICAgLnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICAgICAgICBjb25zdCBhcmdzID0gc2VsZi5wcmVwYXJlQXJndW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgLy8gTGV0cyBtb3VudCByZWdleC5cbiAgICAgICAgICAgICAgICBjb25zdCByZWdleFYxID0gbmV3IFJlZ0V4cChgJHthcmdzLmpvaW4oJ1xcXFxzKycpfVxcXFxzKyhcXFxcZCspYCwgJ2dtJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXhWMiA9IG5ldyBSZWdFeHAoYFwiJHthcmdzLmpvaW4oJ1wiXFxcXHMrXCInKX1cIlxcXFxzKyhcXFxcZCspYCwgJ2dtJyk7XG4gICAgICAgICAgICAgICAgLy8gTm8gd2Ugd2lsbCBjaGVjayBmb3IgdGhvc2Ugd2l0aCB0aGUgbWF0Y2hpbmcgcGFyYW1zLlxuICAgICAgICAgICAgICAgIG91dC5mb3JFYWNoKChsaW5lKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXhWMS5leGVjKGxpbmUpIHx8IHJlZ2V4VjIuZXhlYyhsaW5lKSB8fCBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZy5kZWJ1Zyhga2lsbGluZyBwaWQ6ICR7bWF0Y2hbMV19YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzcGF3bi5zeW5jKCd0YXNra2lsbCcsIFsnL3BpZCcsIG1hdGNoWzFdLCAnL2YnLCAnL3QnXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmVnZXhWMS5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICByZWdleFYyLmxhc3RJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHdyaXRlTG9nKCkge1xuICAgICAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoJ21ldGVvci5sb2cnLCBsb2csICdVVEYtOCcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBjbGVhclRpbWVvdXRzQW5kSW50ZXJ2YWxzKCkge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoY29yZG92YUNoZWNrSW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dChidWlsZFRpbWVvdXQpO1xuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dChlcnJvclRpbWVvdXQpO1xuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dChtZXNzYWdlVGltZW91dCk7XG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KGtpbGxUaW1lb3V0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgYXJncyA9IHRoaXMucHJlcGFyZUFyZ3VtZW50cygpO1xuXG4gICAgICAgICAgICB0aGlzLmxvZy5pbmZvKGBydW5uaW5nIFwibWV0ZW9yICR7YXJncy5qb2luKCcgJyl9XCIuLi4gdGhpcyBtaWdodCB0YWtlIGEgd2hpbGVgKTtcblxuICAgICAgICAgICAgY29uc3QgZW52ID0geyBNRVRFT1JfUFJFVFRZX09VVFBVVDogMCwgTUVURU9SX05PX1JFTEVBU0VfQ0hFQ0s6IDEgfTtcbiAgICAgICAgICAgIGlmICh0aGlzLiQuZW52Lm9wdGlvbnMucHJvZERlYnVnKSB7XG4gICAgICAgICAgICAgICAgZW52Lk1FVEVPUl9ERVNLT1BfUFJPRF9ERUJVRyA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIExldHMgc3Bhd24gbWV0ZW9yLlxuICAgICAgICAgICAgY29uc3QgY2hpbGQgPSBzcGF3bihcbiAgICAgICAgICAgICAgICAnbWV0ZW9yJyxcbiAgICAgICAgICAgICAgICBhcmdzLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgZW52OiBPYmplY3QuYXNzaWduKGVudiwgcHJvY2Vzcy5lbnYpLFxuICAgICAgICAgICAgICAgICAgICBjd2Q6IHRoaXMuJC5lbnYucGF0aHMubWV0ZW9yQXBwLnJvb3RcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHsgc2hlbGw6IHRydWUgfVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgLy8gS2lsbHMgdGhlIGN1cnJlbnRseSBydW5uaW5nIG1ldGVvciBjb21tYW5kLlxuICAgICAgICAgICAgZnVuY3Rpb24ga2lsbCgpIHtcbiAgICAgICAgICAgICAgICBzbGwoJycpO1xuICAgICAgICAgICAgICAgIGNoaWxkLmtpbGwoJ1NJR0tJTEwnKTtcbiAgICAgICAgICAgICAgICBpZiAoc2VsZi4kLmVudi5vcy5pc1dpbmRvd3MpIHtcbiAgICAgICAgICAgICAgICAgICAgd2luZG93c0tpbGwoY2hpbGQucGlkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGV4aXQoKSB7XG4gICAgICAgICAgICAgICAga2lsbFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0c0FuZEludGVydmFscygpO1xuICAgICAgICAgICAgICAgICAgICBkZXNpcmVkRXhpdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGtpbGwoKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgIH0sIDUwMCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNvcHlCdWlsZCgpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmNvcHlCdWlsZCgpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBleGl0KCk7XG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXRzQW5kSW50ZXJ2YWxzKCk7XG4gICAgICAgICAgICAgICAgICAgIGtpbGwoKTtcbiAgICAgICAgICAgICAgICAgICAgd3JpdGVMb2coKTtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KCdjb3B5Jyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvcmRvdmFDaGVja0ludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHdlIGFscmVhZHkgaGF2ZSBjb3Jkb3ZhLWJ1aWxkIHJlYWR5LlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzQ29yZG92YUJ1aWxkUmVhZHkoKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiBzbywgdGhlbiBleGl0IGltbWVkaWF0ZWx5LlxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5pbmRleEhUTUxzdHJhdGVneSA9PT1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW5kZXhIVE1MU3RyYXRlZ2llcy5JTkRFWF9GUk9NX0NPUkRPVkFfQlVJTEQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvcHlCdWlsZCgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSwgMTAwMCk7XG5cbiAgICAgICAgICAgIGNoaWxkLnN0ZGVyci5vbignZGF0YScsIChjaHVuaykgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpbmUgPSBjaHVuay50b1N0cmluZygnVVRGLTgnKTtcbiAgICAgICAgICAgICAgICBsb2cgKz0gYCR7bGluZX1cXG5gO1xuICAgICAgICAgICAgICAgIGlmIChlcnJvclRpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KGVycm9yVGltZW91dCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIERvIG5vdCBleGl0IGlmIHRoaXMgaXMgdGhlIHdhcm5pbmcgZm9yIHVzaW5nIC0tcHJvZHVjdGlvbi5cbiAgICAgICAgICAgICAgICAvLyBPdXRwdXQgZXhjZWVkcyAtPiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9pc3N1ZXMvODU5MlxuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICAgIX5saW5lLmluZGV4T2YoJy0tcHJvZHVjdGlvbicpICYmXG4gICAgICAgICAgICAgICAgICAgICF+bGluZS5pbmRleE9mKCdPdXRwdXQgZXhjZWVkcyAnKSAmJlxuICAgICAgICAgICAgICAgICAgICAhfmxpbmUuaW5kZXhPZignTm9kZSNtb3ZlVG8nKSAmJlxuICAgICAgICAgICAgICAgICAgICAhfmxpbmUuaW5kZXhPZignQnJvd3NlcnNsaXN0JykgJiZcbiAgICAgICAgICAgICAgICAgICAgKFxuICAgICAgICAgICAgICAgICAgICAgICAgQXJyYXkuaXNBcnJheShzZWxmLiQuZW52Lm9wdGlvbnMuaWdub3JlU3RkZXJyKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi4kLmVudi5vcHRpb25zLmlnbm9yZVN0ZGVyci5ldmVyeShzdHIgPT4gIX5saW5lLmluZGV4T2Yoc3RyKSlcbiAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmxvZy53YXJuKCdTVERFUlI6JywgbGluZSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIHdpbGwgZXhpdCAxcyBhZnRlciBsYXN0IGVycm9yIGluIHN0ZGVyci5cbiAgICAgICAgICAgICAgICAgICAgZXJyb3JUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXRzQW5kSW50ZXJ2YWxzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBraWxsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB3cml0ZUxvZygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KCdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICB9LCAxMDAwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY2hpbGQuc3Rkb3V0Lm9uKCdkYXRhJywgKGNodW5rKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGluZSA9IGNodW5rLnRvU3RyaW5nKCdVVEYtOCcpO1xuICAgICAgICAgICAgICAgIGlmICghZGVzaXJlZEV4aXQgJiYgbGluZS50cmltKCkucmVwbGFjZSgvW1xcblxcclxcdFxcdlxcZl0rL2dtLCAnJykgIT09ICcnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxpbmVzVG9EaXNwbGF5ID0gbGluZS50cmltKClcbiAgICAgICAgICAgICAgICAgICAgICAgIC5zcGxpdCgnXFxuXFxyJyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIE9ubHkgZGlzcGxheSBsYXN0IGxpbmUgZnJvbSB0aGUgY2h1bmsuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNhbml0aXplZExpbmUgPSBsaW5lc1RvRGlzcGxheS5wb3AoKS5yZXBsYWNlKC9bXFxuXFxyXFx0XFx2XFxmXSsvZ20sICcnKTtcbiAgICAgICAgICAgICAgICAgICAgc2xsKHNhbml0aXplZExpbmUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsb2cgKz0gYCR7bGluZX1cXG5gO1xuICAgICAgICAgICAgICAgIGlmICh+bGluZS5pbmRleE9mKCdhZnRlcl9wbGF0Zm9ybV9hZGQnKSkge1xuICAgICAgICAgICAgICAgICAgICBzbGwoJycpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvZy5pbmZvKCdkb25lLi4uIDEwJScpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh+bGluZS5pbmRleE9mKCdMb2NhbCBwYWNrYWdlIHZlcnNpb24nKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAobWVzc2FnZVRpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dChtZXNzYWdlVGltZW91dCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNsbCgnJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvZy5pbmZvKCdidWlsZGluZyBpbiBwcm9ncmVzcy4uLicpO1xuICAgICAgICAgICAgICAgICAgICB9LCAxNTAwKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAofmxpbmUuaW5kZXhPZignUHJlcGFyaW5nIENvcmRvdmEgcHJvamVjdCcpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNsbCgnJyk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9nLmluZm8oJ2RvbmUuLi4gNjAlJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKH5saW5lLmluZGV4T2YoJ0NhblxcJ3QgbGlzdGVuIG9uIHBvcnQnKSkge1xuICAgICAgICAgICAgICAgICAgICBwb3J0UHJvYmxlbSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKH5saW5lLmluZGV4T2YoJ1lvdXIgYXBwbGljYXRpb24gaGFzIGVycm9ycycpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnJvclRpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dChlcnJvclRpbWVvdXQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVycm9yVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0c0FuZEludGVydmFscygpO1xuICAgICAgICAgICAgICAgICAgICAgICAga2lsbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgd3JpdGVMb2coKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdCgnZXJyb3JJbkFwcCcpO1xuICAgICAgICAgICAgICAgICAgICB9LCAxMDAwKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAofmxpbmUuaW5kZXhPZignQXBwIHJ1bm5pbmcgYXQnKSkge1xuICAgICAgICAgICAgICAgICAgICBjb3B5QnVpbGQoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gV2hlbiBNZXRlb3IgZXhpdHNcbiAgICAgICAgICAgIGNoaWxkLm9uKCdleGl0JywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHNsbCgnJyk7XG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0c0FuZEludGVydmFscygpO1xuICAgICAgICAgICAgICAgIGlmICghZGVzaXJlZEV4aXQpIHtcbiAgICAgICAgICAgICAgICAgICAgd3JpdGVMb2coKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBvcnRQcm9ibGVtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoJ3BvcnQnKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdCgnZXhpdCcpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGJ1aWxkVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIGtpbGwoKTtcbiAgICAgICAgICAgICAgICB3cml0ZUxvZygpO1xuICAgICAgICAgICAgICAgIHJlamVjdCgndGltZW91dCcpO1xuICAgICAgICAgICAgfSwgdGhpcy4kLmVudi5vcHRpb25zLmJ1aWxkVGltZW91dCA/IHRoaXMuJC5lbnYub3B0aW9ucy5idWlsZFRpbWVvdXQgKiAxMDAwIDogNjAwMDAwKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVwbGFjZXMgdGhlIEREUCB1cmwgdGhhdCB3YXMgdXNlZCBvcmlnaW5hbGx5IHdoZW4gTWV0ZW9yIHdhcyBidWlsZGluZyB0aGUgY2xpZW50LlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBpbmRleEh0bWwgLSBwYXRoIHRvIGluZGV4Lmh0bWwgZnJvbSB0aGUgY2xpZW50XG4gICAgICovXG4gICAgdXBkYXRlRGRwVXJsKGluZGV4SHRtbCkge1xuICAgICAgICBsZXQgY29udGVudDtcbiAgICAgICAgbGV0IHJ1bnRpbWVDb25maWc7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoaW5kZXhIdG1sLCAnVVRGLTgnKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoYGVycm9yIGxvYWRpbmcgaW5kZXguaHRtbCBmaWxlOiAke2UubWVzc2FnZX1gKTtcbiAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMubWF0Y2hlci50ZXN0KGNvbnRlbnQpKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignY291bGQgbm90IGZpbmQgcnVudGltZSBjb25maWcgaW4gaW5kZXggZmlsZScpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBjb250ZW50Lm1hdGNoKHRoaXMubWF0Y2hlcik7XG4gICAgICAgICAgICBydW50aW1lQ29uZmlnID0gSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQobWF0Y2hlc1sxXSkpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignY291bGQgbm90IGZpbmQgcnVudGltZSBjb25maWcgaW4gaW5kZXggZmlsZScpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJC5lbnYub3B0aW9ucy5kZHBVcmwuc3Vic3RyKC0xLCAxKSAhPT0gJy8nKSB7XG4gICAgICAgICAgICB0aGlzLiQuZW52Lm9wdGlvbnMuZGRwVXJsICs9ICcvJztcbiAgICAgICAgfVxuXG4gICAgICAgIHJ1bnRpbWVDb25maWcuUk9PVF9VUkwgPSB0aGlzLiQuZW52Lm9wdGlvbnMuZGRwVXJsO1xuICAgICAgICBydW50aW1lQ29uZmlnLkREUF9ERUZBVUxUX0NPTk5FQ1RJT05fVVJMID0gdGhpcy4kLmVudi5vcHRpb25zLmRkcFVybDtcblxuICAgICAgICBjb250ZW50ID0gY29udGVudC5yZXBsYWNlKFxuICAgICAgICAgICAgdGhpcy5yZXBsYWNlciwgYCQxXCIke2VuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShydW50aW1lQ29uZmlnKSl9XCIkM2BcbiAgICAgICAgKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhpbmRleEh0bWwsIGNvbnRlbnQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcihgZXJyb3Igd3JpdGluZyBpbmRleC5odG1sIGZpbGU6ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubG9nLmluZm8oJ3N1Y2Nlc3NmdWxseSB1cGRhdGVkIGRkcCBzdHJpbmcgaW4gdGhlIHJ1bnRpbWUgY29uZmlnIG9mIGEgbW9iaWxlIGJ1aWxkJyArXG4gICAgICAgICAgICBgIHRvICR7dGhpcy4kLmVudi5vcHRpb25zLmRkcFVybH1gKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQcmVwYXJlcyB0aGUgYXJndW1lbnRzIHBhc3NlZCB0byBgbWV0ZW9yYCBjb21tYW5kLlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmdbXX1cbiAgICAgKi9cbiAgICBwcmVwYXJlQXJndW1lbnRzKCkge1xuICAgICAgICBjb25zdCBhcmdzID0gWydydW4nLCAnLS12ZXJib3NlJywgYC0tbW9iaWxlLXNlcnZlcj0ke3RoaXMuJC5lbnYub3B0aW9ucy5kZHBVcmx9YF07XG4gICAgICAgIGlmICh0aGlzLiQuZW52LmlzUHJvZHVjdGlvbkJ1aWxkKCkpIHtcbiAgICAgICAgICAgIGFyZ3MucHVzaCgnLS1wcm9kdWN0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgYXJncy5wdXNoKCctcCcpO1xuICAgICAgICBpZiAodGhpcy4kLmVudi5vcHRpb25zLnBvcnQpIHtcbiAgICAgICAgICAgIGFyZ3MucHVzaCh0aGlzLiQuZW52Lm9wdGlvbnMucG9ydCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhcmdzLnB1c2goJzMwODAnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy4kLmVudi5vcHRpb25zLm1ldGVvclNldHRpbmdzKSB7XG4gICAgICAgICAgICBhcmdzLnB1c2goJy0tc2V0dGluZ3MnLCB0aGlzLiQuZW52Lm9wdGlvbnMubWV0ZW9yU2V0dGluZ3MpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhcmdzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFZhbGlkYXRlcyB0aGUgbW9iaWxlIGJ1aWxkIGFuZCBjb3BpZXMgaXQgaW50byBlbGVjdHJvbiBhcHAuXG4gICAgICovXG4gICAgYXN5bmMgY29weUJ1aWxkKCkge1xuICAgICAgICB0aGlzLmxvZy5kZWJ1ZygnY2xlYXJpbmcgYnVpbGQgZGlyJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLiQudXRpbHMucm1XaXRoUmV0cmllcygnLXJmJywgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5tZXRlb3JBcHApO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcHJlZml4ID0gJ2NvcmRvdmFCdWlsZCc7XG4gICAgICAgIGxldCBjb3B5UGF0aFBvc3RmaXggPSAnJztcblxuICAgICAgICBpZiAodGhpcy5pbmRleEhUTUxzdHJhdGVneSA9PT0gdGhpcy5pbmRleEhUTUxTdHJhdGVnaWVzLklOREVYX0ZST01fUlVOTklOR19TRVJWRVIpIHtcbiAgICAgICAgICAgIHByZWZpeCA9ICd3ZWJDb3Jkb3ZhJztcbiAgICAgICAgICAgIGNvcHlQYXRoUG9zdGZpeCA9IGAke3BhdGguc2VwfSpgO1xuICAgICAgICAgICAgbGV0IGluZGV4SHRtbDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgZnMubWtkaXJTeW5jKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubWV0ZW9yQXBwKTtcbiAgICAgICAgICAgICAgICBpbmRleEh0bWwgPSBhd2FpdCB0aGlzLmFjcXVpcmVJbmRleCgpO1xuICAgICAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmModGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5tZXRlb3JBcHBJbmRleCwgaW5kZXhIdG1sKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy5pbmZvKCdzdWNjZXNzZnVsbHkgZG93bmxvYWRlZCBpbmRleC5odG1sIGZyb20gcnVubmluZyBtZXRlb3IgYXBwJyk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ2Vycm9yIHdoaWxlIHRyeWluZyB0byBkb3dubG9hZCBpbmRleC5odG1sIGZvciB3ZWIuY29yZG92YSwgJyArXG4gICAgICAgICAgICAgICAgICAgICdiZSBzdXJlIHRoYXQgeW91IGFyZSBydW5uaW5nIGEgbW9iaWxlIHRhcmdldCBvciB3aXRoJyArXG4gICAgICAgICAgICAgICAgICAgICcgLS1tb2JpbGUtc2VydmVyOiAnLCBlKTtcbiAgICAgICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29yZG92YUJ1aWxkID0gdGhpcy4kLmVudi5wYXRocy5tZXRlb3JBcHBbcHJlZml4XTtcbiAgICAgICAgY29uc3QgeyBjb3Jkb3ZhQnVpbGRJbmRleCB9ID0gdGhpcy4kLmVudi5wYXRocy5tZXRlb3JBcHA7XG4gICAgICAgIGNvbnN0IGNvcmRvdmFCdWlsZFByb2dyYW1Kc29uID0gdGhpcy4kLmVudi5wYXRocy5tZXRlb3JBcHBbYCR7cHJlZml4fVByb2dyYW1Kc29uYF07XG5cbiAgICAgICAgaWYgKCF0aGlzLiQudXRpbHMuZXhpc3RzKGNvcmRvdmFCdWlsZCkpIHtcbiAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKGBubyBtb2JpbGUgYnVpbGQgZm91bmQgYXQgJHtjb3Jkb3ZhQnVpbGR9YCk7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignYXJlIHlvdSBzdXJlIHlvdSBkaWQgcnVuIG1ldGVvciB3aXRoIC0tbW9iaWxlLXNlcnZlcj8nKTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigncmVxdWlyZWQgZmlsZSBub3QgcHJlc2VudCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiQudXRpbHMuZXhpc3RzKGNvcmRvdmFCdWlsZFByb2dyYW1Kc29uKSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ25vIHByb2dyYW0uanNvbiBmb3VuZCBpbiBtb2JpbGUgYnVpbGQgZm91bmQgYXQgJyArXG4gICAgICAgICAgICAgICAgYCR7Y29yZG92YUJ1aWxkfWApO1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ2FyZSB5b3Ugc3VyZSB5b3UgZGlkIHJ1biBtZXRlb3Igd2l0aCAtLW1vYmlsZS1zZXJ2ZXI/Jyk7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3JlcXVpcmVkIGZpbGUgbm90IHByZXNlbnQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmluZGV4SFRNTHN0cmF0ZWd5ICE9PSB0aGlzLmluZGV4SFRNTFN0cmF0ZWdpZXMuSU5ERVhfRlJPTV9SVU5OSU5HX1NFUlZFUikge1xuICAgICAgICAgICAgaWYgKCF0aGlzLiQudXRpbHMuZXhpc3RzKGNvcmRvdmFCdWlsZEluZGV4KSkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKCdubyBpbmRleC5odG1sIGZvdW5kIGluIGNvcmRvdmEgYnVpbGQgZm91bmQgYXQgJyArXG4gICAgICAgICAgICAgICAgICAgIGAke2NvcmRvdmFCdWlsZH1gKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignYXJlIHlvdSBzdXJlIHlvdSBkaWQgcnVuIG1ldGVvciB3aXRoIC0tbW9iaWxlLXNlcnZlcj8nKTtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3JlcXVpcmVkIGZpbGUgbm90IHByZXNlbnQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubG9nLnZlcmJvc2UoJ2NvcHlpbmcgbW9iaWxlIGJ1aWxkJyk7XG4gICAgICAgIHNoZWxsLmNwKFxuICAgICAgICAgICAgJy1SJywgYCR7Y29yZG92YUJ1aWxkfSR7Y29weVBhdGhQb3N0Zml4fWAsIHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubWV0ZW9yQXBwXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gQmVjYXVzZSBvZiB2YXJpb3VzIHBlcm1pc3Npb24gcHJvYmxlbXMgaGVyZSB3ZSB0cnkgdG8gY2xlYXIgdGUgcGF0aCBieSBjbGVhcmluZ1xuICAgICAgICAvLyBhbGwgcG9zc2libGUgcmVzdHJpY3Rpb25zLlxuICAgICAgICBzaGVsbC5jaG1vZChcbiAgICAgICAgICAgICctUicsICc3NzcnLCB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLm1ldGVvckFwcFxuICAgICAgICApO1xuICAgICAgICBpZiAodGhpcy4kLmVudi5vcy5pc1dpbmRvd3MpIHtcbiAgICAgICAgICAgIHNoZWxsLmV4ZWMoYGF0dHJpYiAtciAke3RoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubWV0ZW9yQXBwfSR7cGF0aC5zZXB9Ki4qIC9zYCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5pbmRleEhUTUxzdHJhdGVneSA9PT0gdGhpcy5pbmRleEhUTUxTdHJhdGVnaWVzLklOREVYX0ZST01fUlVOTklOR19TRVJWRVIpIHtcbiAgICAgICAgICAgIGxldCBwcm9ncmFtSnNvbjtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcHJvZ3JhbUpzb24gPSBhd2FpdCB0aGlzLmFjcXVpcmVNYW5pZmVzdCgpO1xuICAgICAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubWV0ZW9yQXBwUHJvZ3JhbUpzb24sXG4gICAgICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHByb2dyYW1Kc29uLCBudWxsLCA0KVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2cuaW5mbygnc3VjY2Vzc2Z1bGx5IGRvd25sb2FkZWQgbWFuaWZlc3QuanNvbiBmcm9tIHJ1bm5pbmcgbWV0ZW9yIGFwcCcpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKCdlcnJvciB3aGlsZSB0cnlpbmcgdG8gZG93bmxvYWQgbWFuaWZlc3QuanNvbiBmb3Igd2ViLmNvcmRvdmEsJyArXG4gICAgICAgICAgICAgICAgICAgICcgYmUgc3VyZSB0aGF0IHlvdSBhcmUgcnVubmluZyBhIG1vYmlsZSB0YXJnZXQgb3Igd2l0aCcgK1xuICAgICAgICAgICAgICAgICAgICAnIC0tbW9iaWxlLXNlcnZlcjogJywgZSk7XG4gICAgICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubG9nLmluZm8oJ21vYmlsZSBidWlsZCBjb3BpZWQgdG8gZWxlY3Ryb24gYXBwJyk7XG5cbiAgICAgICAgdGhpcy5sb2cuZGVidWcoJ2NvcHkgY29yZG92YS5qcyB0byBtZXRlb3IgYnVpbGQnKTtcbiAgICAgICAgc2hlbGwuY3AoXG4gICAgICAgICAgICBqb2luKF9fZGlybmFtZSwgJy4uJywgJ3NrZWxldG9uJywgJ2NvcmRvdmEuanMnKSxcbiAgICAgICAgICAgIHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubWV0ZW9yQXBwXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5qZWN0cyBNZXRlb3IuaXNEZXNrdG9wXG4gICAgICovXG4gICAgaW5qZWN0SXNEZXNrdG9wKCkge1xuICAgICAgICB0aGlzLmxvZy5pbmZvKCdpbmplY3RpbmcgaXNEZXNrdG9wJyk7XG5cbiAgICAgICAgbGV0IG1hbmlmZXN0SnNvblBhdGggPSB0aGlzLiQuZW52LnBhdGhzLm1ldGVvckFwcC5jb3Jkb3ZhQnVpbGRQcm9ncmFtSnNvbjtcbiAgICAgICAgaWYgKHRoaXMuaW5kZXhIVE1Mc3RyYXRlZ3kgPT09IHRoaXMuaW5kZXhIVE1MU3RyYXRlZ2llcy5JTkRFWF9GUk9NX1JVTk5JTkdfU0VSVkVSKSB7XG4gICAgICAgICAgICBtYW5pZmVzdEpzb25QYXRoID0gdGhpcy4kLmVudi5wYXRocy5tZXRlb3JBcHAud2ViQ29yZG92YVByb2dyYW1Kc29uO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgbWFuaWZlc3QgfSA9IEpTT04ucGFyc2UoXG4gICAgICAgICAgICAgICAgZnMucmVhZEZpbGVTeW5jKG1hbmlmZXN0SnNvblBhdGgsICdVVEYtOCcpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgbGV0IGluamVjdGVkID0gZmFsc2U7XG4gICAgICAgICAgICBsZXQgaW5qZWN0ZWRTdGFydHVwRGlkQ29tcGxldGUgPSBmYWxzZTtcbiAgICAgICAgICAgIGxldCByZXN1bHQgPSBudWxsO1xuXG4gICAgICAgICAgICAvLyBXZSB3aWxsIHNlYXJjaCBpbiBldmVyeSAuanMgZmlsZSBpbiB0aGUgbWFuaWZlc3QuXG4gICAgICAgICAgICAvLyBXZSBjb3VsZCBwcm9iYWJseSBkZXRlY3Qgd2hldGhlciB0aGlzIGlzIGEgZGV2IG9yIHByb2R1Y3Rpb24gYnVpbGQgYW5kIG9ubHkgc2VhcmNoIGluXG4gICAgICAgICAgICAvLyB0aGUgY29ycmVjdCBmaWxlcywgYnV0IGZvciBub3cgdGhpcyBzaG91bGQgYmUgZmluZS5cbiAgICAgICAgICAgIG1hbmlmZXN0LmZvckVhY2goKGZpbGUpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgZmlsZUNvbnRlbnRzO1xuICAgICAgICAgICAgICAgIC8vIEhhY2t5IHdheSBvZiBzZXR0aW5nIGlzRGVza3RvcC5cbiAgICAgICAgICAgICAgICBpZiAoZmlsZS50eXBlID09PSAnanMnKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVDb250ZW50cyA9IGZzLnJlYWRGaWxlU3luYyhcbiAgICAgICAgICAgICAgICAgICAgICAgIGpvaW4odGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5tZXRlb3JBcHAsIGZpbGUucGF0aCksXG4gICAgICAgICAgICAgICAgICAgICAgICAnVVRGLTgnXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRoaXMuaW5qZWN0b3IucHJvY2Vzc0ZpbGVDb250ZW50cyhmaWxlQ29udGVudHMpO1xuXG4gICAgICAgICAgICAgICAgICAgICh7IGZpbGVDb250ZW50cyB9ID0gcmVzdWx0KTtcbiAgICAgICAgICAgICAgICAgICAgaW5qZWN0ZWRTdGFydHVwRGlkQ29tcGxldGUgPVxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LmluamVjdGVkU3RhcnR1cERpZENvbXBsZXRlID8gdHJ1ZSA6IGluamVjdGVkU3RhcnR1cERpZENvbXBsZXRlO1xuICAgICAgICAgICAgICAgICAgICBpbmplY3RlZCA9IHJlc3VsdC5pbmplY3RlZCA/IHRydWUgOiBpbmplY3RlZDtcblxuICAgICAgICAgICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKFxuICAgICAgICAgICAgICAgICAgICAgICAgam9pbih0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLm1ldGVvckFwcCwgZmlsZS5wYXRoKSwgZmlsZUNvbnRlbnRzXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmICghaW5qZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3IgaW5qZWN0aW5nIGlzRGVza3RvcCBnbG9iYWwgdmFyLicpO1xuICAgICAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghaW5qZWN0ZWRTdGFydHVwRGlkQ29tcGxldGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3IgaW5qZWN0aW5nIGlzRGVza3RvcCBmb3Igc3RhcnR1cERpZENvbXBsZXRlJyk7XG4gICAgICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igb2NjdXJyZWQgd2hpbGUgaW5qZWN0aW5nIGlzRGVza3RvcDogJywgZSk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5sb2cuaW5mbygnaW5qZWN0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQnVpbGRzLCBtb2RpZmllcyBhbmQgY29waWVzIHRoZSBtZXRlb3IgYXBwIHRvIGVsZWN0cm9uIGFwcC5cbiAgICAgKi9cbiAgICBhc3luYyBidWlsZCgpIHtcbiAgICAgICAgdGhpcy5sb2cuaW5mbygnY2hlY2tpbmcgZm9yIGFueSBtb2JpbGUgcGxhdGZvcm0nKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuY2hlY2tQcmVjb25kaXRpb25zKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKCdlcnJvciBvY2N1cnJlZCBkdXJpbmcgY2hlY2tpbmcgcHJlY29uZGl0aW9uczogJywgZSk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmxvZy5pbmZvKCdidWlsZGluZyBtZXRlb3IgYXBwJyk7XG5cbiAgICAgICAgaWYgKCF0aGlzLiQuZW52Lm9wdGlvbnMuc2tpcE1vYmlsZUJ1aWxkKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYnVpbGRNb2JpbGVUYXJnZXQoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKHJlYXNvbikge1xuICAgICAgICAgICAgICAgIHN3aXRjaCAocmVhc29uKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3RpbWVvdXQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3RpbWVvdXQgd2hpbGUgYnVpbGRpbmcsIGxvZyBoYXMgYmVlbiB3cml0dGVuIHRvIG1ldGVvci5sb2cnXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2Vycm9yJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdidWlsZCB3YXMgdGVybWluYXRlZCBieSBtZXRlb3ItZGVza3RvcCBhcyBzb21lIGVycm9ycyB3ZXJlIHJlcG9ydGVkIHRvIHN0ZGVyciwgeW91ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdzaG91bGQgc2VlIGl0IGFib3ZlLCBhbHNvIGNoZWNrIG1ldGVvci5sb2cgZm9yIG1vcmUgaW5mbywgdG8gaWdub3JlIGl0IHVzZSB0aGUgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJy0taWdub3JlLXN0ZGVyciBcIjxzdHJpbmc+XCInXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2Vycm9ySW5BcHAnOlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3lvdXIgbWV0ZW9yIGFwcCBoYXMgZXJyb3JzIC0gbG9vayBpbnRvIG1ldGVvci5sb2cgZm9yIG1vcmUnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnIGluZm8nXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ3BvcnQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3lvdXIgcG9ydCAzMDgwIGlzIGN1cnJlbnRseSB1c2VkICh5b3UgcHJvYmFibHkgaGF2ZSB0aGlzIG9yIG90aGVyICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdtZXRlb3IgcHJvamVjdCBydW5uaW5nPyksIHVzZSBgLXRgIG9yIGAtLW1ldGVvci1wb3J0YCB0byB1c2UgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2RpZmZlcmVudCBwb3J0IHdoaWxlIGJ1aWxkaW5nJ1xuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdleGl0JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdtZXRlb3IgY21kIGV4aXRlZCB1bmV4cGVjdGVkbHksIGxvZyBoYXMgYmVlbiB3cml0dGVuIHRvIG1ldGVvci5sb2cnXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2NvcHknOlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2Vycm9yIGVuY291bnRlcmVkIHdoZW4gY29weWluZyB0aGUgYnVpbGQnXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igb2NjdXJyZWQgZHVyaW5nIGJ1aWxkaW5nIG1vYmlsZSB0YXJnZXQnLCByZWFzb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5tb2JpbGVQbGF0Zm9ybSkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnJlbW92ZU1vYmlsZVBsYXRmb3JtKHRoaXMubW9iaWxlUGxhdGZvcm0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmluZGV4SFRNTHN0cmF0ZWd5ID0gdGhpcy5jaG9vc2VTdHJhdGVneSgpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNvcHlCdWlsZCgpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuaW5qZWN0SXNEZXNrdG9wKCk7XG5cbiAgICAgICAgdGhpcy5jaGFuZ2VEZHBVcmwoKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wYWNrVG9Bc2FyKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKCdlcnJvciB3aGlsZSBwYWNraW5nIG1ldGVvciBhcHAgdG8gYXNhcicpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sb2cuaW5mbygnbWV0ZW9yIGJ1aWxkIGZpbmlzaGVkJyk7XG5cbiAgICAgICAgaWYgKHRoaXMubW9iaWxlUGxhdGZvcm0pIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlTW9iaWxlUGxhdGZvcm0odGhpcy5tb2JpbGVQbGF0Zm9ybSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjaGFuZ2VEZHBVcmwoKSB7XG4gICAgICAgIGlmICh0aGlzLiQuZW52Lm9wdGlvbnMuZGRwVXJsICE9PSBudWxsKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlRGRwVXJsKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubWV0ZW9yQXBwSW5kZXgpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKGBlcnJvciB3aGlsZSB0cnlpbmcgdG8gY2hhbmdlIHRoZSBkZHAgdXJsOiAke2UubWVzc2FnZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBhY2tUb0FzYXIoKSB7XG4gICAgICAgIHRoaXMubG9nLmluZm8oJ3BhY2tpbmcgbWV0ZW9yIGFwcCB0byBhc2FyIGFyY2hpdmUnKTtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICBhc2FyLmNyZWF0ZVBhY2thZ2UoXG4gICAgICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5tZXRlb3JBcHAsXG4gICAgICAgICAgICAgICAgcGF0aC5qb2luKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAucm9vdCwgJ21ldGVvci5hc2FyJylcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIC8vIE9uIFdpbmRvd3Mgc29tZSBmaWxlcyBtaWdodCBzdGlsbCBiZSBibG9ja2VkLiBHaXZpbmcgYSB0aWNrIGZvciB0aGVtIHRvIGJlXG4gICAgICAgICAgICAgICAgICAgIC8vIHJlYWR5IGZvciBkZWxldGlvbi5cbiAgICAgICAgICAgICAgICAgICAgc2V0SW1tZWRpYXRlKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubG9nLnZlcmJvc2UoJ2NsZWFyaW5nIG1ldGVvciBhcHAgYWZ0ZXIgcGFja2luZycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy4kLnV0aWxzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJtV2l0aFJldHJpZXMoJy1yZicsIHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubWV0ZW9yQXBwKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFdyYXBwZXIgZm9yIHNwYXduaW5nIG5wbS5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSAgY29tbWFuZHMgLSBjb21tYW5kcyBmb3Igc3Bhd25cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3RkaW9cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gY3dkXG4gICAgICogQHJldHVybiB7UHJvbWlzZX1cbiAgICAgKi9cbiAgICBydW5OcG0oY29tbWFuZHMsIHN0ZGlvID0gJ2lnbm9yZScsIGN3ZCA9IHRoaXMuJC5lbnYucGF0aHMubWV0ZW9yQXBwLnJvb3QpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMubG9nLnZlcmJvc2UoYGV4ZWN1dGluZyBtZXRlb3IgbnBtICR7Y29tbWFuZHMuam9pbignICcpfWApO1xuXG4gICAgICAgICAgICBzcGF3bignbWV0ZW9yJywgWyducG0nLCAuLi5jb21tYW5kc10sIHtcbiAgICAgICAgICAgICAgICBjd2QsXG4gICAgICAgICAgICAgICAgc3RkaW9cbiAgICAgICAgICAgIH0pLm9uKCdleGl0JywgY29kZSA9PiAoXG4gICAgICAgICAgICAgICAgKGNvZGUgPT09IDApID8gcmVzb2x2ZSgpIDogcmVqZWN0KG5ldyBFcnJvcihgbnBtIGV4aXQgY29kZSB3YXMgJHtjb2RlfWApKVxuICAgICAgICAgICAgKSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUVBOztBQUNBOztBQUNBOzs7O0FBYkE7QUFlQSxNQUFNO0VBQUVBO0FBQUYsSUFBV0MsYUFBakI7QUFDQSxNQUFNQyxHQUFHLEdBQUdDLHNCQUFBLENBQWNDLE1BQTFCLEMsQ0FFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUNlLE1BQU1DLFNBQU4sQ0FBZ0I7RUFDM0I7QUFDSjtBQUNBO0FBQ0E7RUFDSUMsV0FBVyxDQUFDQyxDQUFELEVBQUk7SUFDWCxLQUFLQyxHQUFMLEdBQVcsSUFBSUMsWUFBSixDQUFRLFdBQVIsQ0FBWDtJQUNBLEtBQUtGLENBQUwsR0FBU0EsQ0FBVDtJQUNBLEtBQUtHLGFBQUwsR0FBcUIsSUFBSUMsc0JBQUosQ0FBa0JKLENBQWxCLENBQXJCO0lBQ0EsS0FBS0ssY0FBTCxHQUFzQixJQUF0QjtJQUNBLEtBQUtDLFdBQUwsR0FBbUIsSUFBbkI7SUFDQSxLQUFLQyxRQUFMLEdBQWdCLElBQUlDLDBCQUFKLEVBQWhCO0lBQ0EsS0FBS0MsT0FBTCxHQUFlLElBQUlDLE1BQUosQ0FDWCwrRUFEVyxDQUFmO0lBR0EsS0FBS0MsUUFBTCxHQUFnQixJQUFJRCxNQUFKLENBQ1osbUZBRFksQ0FBaEI7SUFHQSxLQUFLRSxhQUFMLEdBQXFCLElBQXJCO0lBQ0EsS0FBS0MsaUJBQUwsR0FBeUIsSUFBekI7SUFFQSxLQUFLQyxtQkFBTCxHQUEyQjtNQUN2QkMsd0JBQXdCLEVBQUUsQ0FESDtNQUV2QkMseUJBQXlCLEVBQUU7SUFGSixDQUEzQjtJQUtBLEtBQUtDLG1CQUFMLEdBQTJCLENBQUMsbUNBQUQsQ0FBM0I7RUFDSDtFQUVEO0FBQ0o7QUFDQTtBQUNBOzs7RUFDa0MsTUFBeEJDLHdCQUF3QixHQUFHO0lBQzdCLElBQUk7TUFDQSxJQUFJLEtBQUtmLGFBQUwsQ0FBbUJnQixhQUFuQixDQUFpQyxLQUFLRixtQkFBdEMsQ0FBSixFQUFnRTtRQUM1RCxLQUFLaEIsR0FBTCxDQUFTbUIsSUFBVCxDQUFjLGdEQUFkO1FBQ0EsTUFBTSxLQUFLakIsYUFBTCxDQUFtQmtCLGNBQW5CLENBQWtDLEtBQUtKLG1CQUF2QyxDQUFOO01BQ0g7SUFDSixDQUxELENBS0UsT0FBT0ssQ0FBUCxFQUFVO01BQ1IsTUFBTSxJQUFJQyxLQUFKLENBQVVELENBQVYsQ0FBTjtJQUNIO0VBQ0o7RUFFRDtBQUNKO0FBQ0E7OztFQUNrQyxNQUF4QkUsd0JBQXdCLEdBQUc7SUFDN0IsTUFBTUMsa0JBQWtCLEdBQUcsQ0FBQywwQ0FBRCxFQUE2QywwQ0FBN0MsQ0FBM0I7O0lBQ0EsSUFBSSxLQUFLekIsQ0FBTCxDQUFPMEIsT0FBUCxDQUFlQyxXQUFmLEdBQTZCQyxVQUFqQyxFQUE2QztNQUN6QyxLQUFLM0IsR0FBTCxDQUFTNEIsT0FBVCxDQUFpQix1REFBakI7TUFFQSxNQUFNQyxtQkFBbUIsR0FBR0wsa0JBQWtCLENBQUNNLEdBQW5CLENBQXVCQyxXQUFXLElBQUssR0FBRUEsV0FBWSxJQUFHLEtBQUtoQyxDQUFMLENBQU9pQyxVQUFQLEVBQW9CLEVBQTVFLENBQTVCOztNQUVBLElBQUk7UUFDQSxNQUFNLEtBQUs5QixhQUFMLENBQW1CK0IsY0FBbkIsQ0FBa0NULGtCQUFsQyxFQUFzREssbUJBQXRELEVBQTJFLFlBQTNFLENBQU47TUFDSCxDQUZELENBRUUsT0FBT1IsQ0FBUCxFQUFVO1FBQ1IsTUFBTSxJQUFJQyxLQUFKLENBQVVELENBQVYsQ0FBTjtNQUNIO0lBQ0osQ0FWRCxNQVVPO01BQ0gsS0FBS3JCLEdBQUwsQ0FBUzRCLE9BQVQsQ0FBaUIsdURBQWpCOztNQUVBLElBQUk7UUFDQSxJQUFJLEtBQUsxQixhQUFMLENBQW1CZ0IsYUFBbkIsQ0FBaUNNLGtCQUFqQyxDQUFKLEVBQTBEO1VBQ3RELE1BQU0sS0FBS3RCLGFBQUwsQ0FBbUJrQixjQUFuQixDQUFrQ0ksa0JBQWxDLENBQU47UUFDSDtNQUNKLENBSkQsQ0FJRSxPQUFPSCxDQUFQLEVBQVU7UUFDUixNQUFNLElBQUlDLEtBQUosQ0FBVUQsQ0FBVixDQUFOO01BQ0g7SUFDSjtFQUNKO0VBRUQ7QUFDSjtBQUNBOzs7RUFDSWEsZUFBZSxHQUFHO0lBQ2QsS0FBS2xDLEdBQUwsQ0FBUzRCLE9BQVQsQ0FBaUIsNkJBQWpCLEVBRGMsQ0FFZDs7SUFDQSxNQUFNTyxTQUFTLEdBQUdDLFdBQUEsQ0FBR0MsWUFBSCxDQUFnQixLQUFLdEMsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUEyQkwsU0FBM0MsRUFBc0QsT0FBdEQsRUFDYk0sS0FEYSxDQUNQLElBRE8sRUFDREMsTUFEQyxDQUNNQyxXQUFXLElBQUlBLFdBQVcsQ0FBQ0MsSUFBWixPQUF1QixFQUQ1QyxDQUFsQjs7SUFHQSxJQUFJLENBQUMsQ0FBQ1QsU0FBUyxDQUFDVSxPQUFWLENBQWtCLEtBQUs5QyxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJPLFdBQWpCLENBQTZCQyxRQUEvQyxDQUFOLEVBQWdFO01BQzVELEtBQUsvQyxHQUFMLENBQVM0QixPQUFULENBQWtCLFVBQVMsS0FBSzdCLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV0MsS0FBWCxDQUFpQk8sV0FBakIsQ0FBNkJDLFFBQVMsd0JBQWpFO01BQ0FaLFNBQVMsQ0FBQ2EsSUFBVixDQUFlLEtBQUtqRCxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJPLFdBQWpCLENBQTZCQyxRQUE1Qzs7TUFFQVgsV0FBQSxDQUFHYSxhQUFILENBQWlCLEtBQUtsRCxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJDLFNBQWpCLENBQTJCTCxTQUE1QyxFQUF1REEsU0FBUyxDQUFDM0MsSUFBVixDQUFlLElBQWYsQ0FBdkQsRUFBNkUsT0FBN0U7SUFDSDtFQUNKO0VBRUQ7QUFDSjtBQUNBO0FBQ0E7OztFQUNJMEQsZ0JBQWdCLEdBQUc7SUFDZixJQUFJQyxPQUFPLEdBQUdmLFdBQUEsQ0FBR0MsWUFBSCxDQUFnQixLQUFLdEMsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUEyQlcsT0FBM0MsRUFBb0QsT0FBcEQsRUFDVEMsT0FEUyxDQUNELE1BREMsRUFDTyxFQURQLEVBRVRYLEtBRlMsQ0FFSCxJQUZHLEVBRUcsQ0FGSCxDQUFkOztJQUdDLEdBQUdVLE9BQUgsSUFBY0EsT0FBTyxDQUFDVixLQUFSLENBQWMsR0FBZCxDQUFmLENBSmUsQ0FLZjs7SUFDQSxJQUFJLENBQUNVLE9BQU8sQ0FBQ04sT0FBUixDQUFnQixHQUFoQixDQUFMLEVBQTJCO01BQ3RCLENBQUNNLE9BQUQsSUFBWUEsT0FBTyxDQUFDVixLQUFSLENBQWMsR0FBZCxDQUFiO0lBQ0g7O0lBQ0QsT0FBT1UsT0FBUDtFQUNIO0VBRUQ7QUFDSjtBQUNBO0FBQ0E7OztFQUNJRSx5QkFBeUIsR0FBRztJQUN4QixPQUFRLEdBQUUsS0FBS0gsZ0JBQUwsRUFBd0IsTUFBM0IsQ0FBaUNJLEtBQWpDLENBQXVDLHFCQUF2QyxFQUE4RCxDQUE5RCxDQUFQO0VBQ0g7RUFFRDtBQUNKO0FBQ0E7QUFDQTs7O0VBQ0lDLGtCQUFrQixDQUFDQyxZQUFELEVBQWU7SUFDN0IsTUFBTUwsT0FBTyxHQUFHLEtBQUtFLHlCQUFMLEVBQWhCOztJQUNBLElBQUksQ0FBQ0ksZUFBQSxDQUFPQyxTQUFQLENBQWlCUCxPQUFqQixFQUEwQkssWUFBMUIsQ0FBTCxFQUE4QztNQUMxQyxJQUFJLEtBQUt6RCxDQUFMLENBQU91QyxHQUFQLENBQVdxQixPQUFYLENBQW1CQyxlQUF2QixFQUF3QztRQUNwQyxLQUFLNUQsR0FBTCxDQUFTNkQsS0FBVCxDQUFnQix5QkFBd0JWLE9BQVEsc0JBQWpDLEdBQ1YsR0FBRUssWUFBYSxlQURwQjtNQUVILENBSEQsTUFHTztRQUNILEtBQUt4RCxHQUFMLENBQVM2RCxLQUFULENBQWdCLHlCQUF3QlYsT0FBUSxzQkFBakMsR0FDVixHQUFFSyxZQUFhLDREQURMLEdBRVgsaUVBRko7TUFHSDs7TUFDRE0sT0FBTyxDQUFDQyxJQUFSLENBQWEsQ0FBYjtJQUNIO0VBQ0o7RUFFRDtBQUNKO0FBQ0E7QUFDQTs7O0VBQ0lDLGNBQWMsR0FBRztJQUNiLElBQUksS0FBS2pFLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV3FCLE9BQVgsQ0FBbUJNLGlCQUF2QixFQUEwQztNQUN0QyxPQUFPLEtBQUtwRCxtQkFBTCxDQUF5QkMsd0JBQWhDO0lBQ0g7O0lBRUQsTUFBTXFDLE9BQU8sR0FBRyxLQUFLRSx5QkFBTCxFQUFoQjs7SUFDQSxJQUFJSSxlQUFBLENBQU9DLFNBQVAsQ0FBaUJQLE9BQWpCLEVBQTBCLFNBQTFCLENBQUosRUFBMEM7TUFDdEMsT0FBTyxLQUFLdEMsbUJBQUwsQ0FBeUJFLHlCQUFoQztJQUNIOztJQUNELElBQUkwQyxlQUFBLENBQU9DLFNBQVAsQ0FBaUJQLE9BQWpCLEVBQTBCLE9BQTFCLENBQUosRUFBd0M7TUFDcEMsTUFBTWUsZUFBZSxHQUFHLEtBQUtoQixnQkFBTCxHQUF3QlQsS0FBeEIsQ0FBOEIsR0FBOUIsQ0FBeEI7O01BQ0EsSUFBSXlCLGVBQWUsQ0FBQ0MsTUFBaEIsSUFBMEIsQ0FBOUIsRUFBaUM7UUFDN0IsSUFBSUQsZUFBZSxDQUFDLENBQUQsQ0FBZixHQUFxQixDQUF6QixFQUE0QjtVQUN4QixPQUFPLEtBQUtyRCxtQkFBTCxDQUF5QkUseUJBQWhDO1FBQ0g7O1FBQ0QsT0FBTyxLQUFLRixtQkFBTCxDQUF5QkMsd0JBQWhDO01BQ0g7SUFDSjs7SUFDRCxPQUFPLEtBQUtELG1CQUFMLENBQXlCQyx3QkFBaEM7RUFDSDtFQUVEO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7OztFQUM0QixNQUFsQnNELGtCQUFrQixHQUFHO0lBQ3ZCLElBQUksS0FBS3JFLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV3FCLE9BQVgsQ0FBbUJDLGVBQXZCLEVBQXdDO01BQ3BDLEtBQUtMLGtCQUFMLENBQXdCLFVBQXhCO0lBQ0gsQ0FGRCxNQUVPO01BQ0gsS0FBS0Esa0JBQUwsQ0FBd0IsVUFBeEI7TUFDQSxLQUFLM0MsaUJBQUwsR0FBeUIsS0FBS29ELGNBQUwsRUFBekI7O01BQ0EsSUFBSSxLQUFLcEQsaUJBQUwsS0FBMkIsS0FBS0MsbUJBQUwsQ0FBeUJDLHdCQUF4RCxFQUFrRjtRQUM5RSxLQUFLZCxHQUFMLENBQVNxRSxLQUFULENBQ0ksMEVBQ0EsVUFGSjtNQUlILENBTEQsTUFLTztRQUNILEtBQUtyRSxHQUFMLENBQVNxRSxLQUFULENBQ0ksdUVBQ0EsMkJBRko7TUFJSDtJQUNKOztJQUVELElBQUksQ0FBQyxLQUFLdEUsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXcUIsT0FBWCxDQUFtQkMsZUFBeEIsRUFBeUM7TUFDckMsTUFBTVUsU0FBUyxHQUFHbEMsV0FBQSxDQUFHQyxZQUFILENBQWdCLEtBQUt0QyxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJDLFNBQWpCLENBQTJCOEIsU0FBM0MsRUFBc0QsT0FBdEQsQ0FBbEI7O01BQ0EsSUFBSSxDQUFDLENBQUNBLFNBQVMsQ0FBQ3pCLE9BQVYsQ0FBa0IsU0FBbEIsQ0FBRixJQUFrQyxDQUFDLENBQUN5QixTQUFTLENBQUN6QixPQUFWLENBQWtCLEtBQWxCLENBQXhDLEVBQWtFO1FBQzlELElBQUksQ0FBQyxLQUFLOUMsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXcUIsT0FBWCxDQUFtQlksT0FBeEIsRUFBaUM7VUFDN0IsS0FBS25FLGNBQUwsR0FBc0IsS0FBdEI7UUFDSCxDQUZELE1BRU87VUFDSCxLQUFLQSxjQUFMLEdBQXNCLFNBQXRCO1FBQ0g7O1FBQ0QsS0FBS0osR0FBTCxDQUFTd0UsSUFBVCxDQUFlLHlDQUF3QyxLQUFLcEUsY0FBZSxJQUE3RCxHQUNWLDRCQURKOztRQUVBLElBQUk7VUFDQSxNQUFNLEtBQUtxRSxpQkFBTCxDQUF1QixLQUFLckUsY0FBNUIsQ0FBTjtRQUNILENBRkQsQ0FFRSxPQUFPaUIsQ0FBUCxFQUFVO1VBQ1IsS0FBS3JCLEdBQUwsQ0FBUzZELEtBQVQsQ0FBZSxnRUFBZjtVQUNBQyxPQUFPLENBQUNDLElBQVIsQ0FBYSxDQUFiO1FBQ0g7TUFDSjtJQUNKO0VBQ0o7RUFFRDtBQUNKO0FBQ0E7QUFDQTtBQUNBOzs7RUFDSVUsaUJBQWlCLENBQUNDLFFBQUQsRUFBVztJQUN4QixPQUFPLElBQUlDLE9BQUosQ0FBWSxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7TUFDcEMsS0FBSzdFLEdBQUwsQ0FBUzRCLE9BQVQsQ0FBa0IsMkJBQTBCOEMsUUFBUyxFQUFyRDtNQUNBLElBQUFJLG1CQUFBLEVBQU0sUUFBTixFQUFnQixDQUFDLGNBQUQsRUFBaUJKLFFBQWpCLENBQWhCLEVBQTRDO1FBQ3hDSyxHQUFHLEVBQUUsS0FBS2hGLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV0MsS0FBWCxDQUFpQkMsU0FBakIsQ0FBMkJ3QyxJQURRO1FBRXhDQyxLQUFLLEVBQUUsS0FBS2xGLENBQUwsQ0FBT3VDLEdBQVAsQ0FBVzJDO01BRnNCLENBQTVDLEVBR0dDLEVBSEgsQ0FHTSxNQUhOLEVBR2MsTUFBTTtRQUNoQixNQUFNWixTQUFTLEdBQUdsQyxXQUFBLENBQUdDLFlBQUgsQ0FBZ0IsS0FBS3RDLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV0MsS0FBWCxDQUFpQkMsU0FBakIsQ0FBMkI4QixTQUEzQyxFQUFzRCxPQUF0RCxDQUFsQjs7UUFDQSxJQUFJLENBQUMsQ0FBQ0EsU0FBUyxDQUFDekIsT0FBVixDQUFrQixTQUFsQixDQUFGLElBQWtDLENBQUMsQ0FBQ3lCLFNBQVMsQ0FBQ3pCLE9BQVYsQ0FBa0IsS0FBbEIsQ0FBeEMsRUFBa0U7VUFDOURnQyxNQUFNO1FBQ1QsQ0FGRCxNQUVPO1VBQ0hELE9BQU87UUFDVjtNQUNKLENBVkQ7SUFXSCxDQWJNLENBQVA7RUFjSDtFQUVEO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7OztFQUNJTyxvQkFBb0IsQ0FBQ1QsUUFBRCxFQUFXO0lBQzNCLElBQUksS0FBSzNFLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV3FCLE9BQVgsQ0FBbUJ5Qix3QkFBdkIsRUFBaUQ7TUFDN0MsT0FBT1QsT0FBTyxDQUFDQyxPQUFSLEVBQVA7SUFDSDs7SUFDRCxPQUFPLElBQUlELE9BQUosQ0FBWSxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7TUFDcEMsS0FBSzdFLEdBQUwsQ0FBUzRCLE9BQVQsQ0FBa0IsNkJBQTRCOEMsUUFBUyxFQUF2RDtNQUNBLElBQUFJLG1CQUFBLEVBQU0sUUFBTixFQUFnQixDQUFDLGlCQUFELEVBQW9CSixRQUFwQixDQUFoQixFQUErQztRQUMzQ0ssR0FBRyxFQUFFLEtBQUtoRixDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJDLFNBQWpCLENBQTJCd0MsSUFEVztRQUUzQ0MsS0FBSyxFQUFFLEtBQUtsRixDQUFMLENBQU91QyxHQUFQLENBQVcyQyxLQUZ5QjtRQUczQzNDLEdBQUcsRUFBRStDLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjO1VBQUVDLG9CQUFvQixFQUFFO1FBQXhCLENBQWQsRUFBMkN6QixPQUFPLENBQUN4QixHQUFuRDtNQUhzQyxDQUEvQyxFQUlHNEMsRUFKSCxDQUlNLE1BSk4sRUFJYyxNQUFNO1FBQ2hCLE1BQU1aLFNBQVMsR0FBR2xDLFdBQUEsQ0FBR0MsWUFBSCxDQUFnQixLQUFLdEMsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUEyQjhCLFNBQTNDLEVBQXNELE9BQXRELENBQWxCOztRQUNBLElBQUksQ0FBQ0EsU0FBUyxDQUFDekIsT0FBVixDQUFrQjZCLFFBQWxCLENBQUwsRUFBa0M7VUFDOUJHLE1BQU07UUFDVCxDQUZELE1BRU87VUFDSEQsT0FBTztRQUNWO01BQ0osQ0FYRDtJQVlILENBZE0sQ0FBUDtFQWVIO0VBRUQ7QUFDSjtBQUNBO0FBQ0E7OztFQUNJWSxtQkFBbUIsR0FBRztJQUNsQixJQUFJLEtBQUs1RSxpQkFBTCxLQUEyQixLQUFLQyxtQkFBTCxDQUF5QkMsd0JBQXhELEVBQWtGO01BQzlFLE9BQU8sS0FBS2YsQ0FBTCxDQUFPMEYsS0FBUCxDQUFhQyxNQUFiLENBQW9CLEtBQUszRixDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJDLFNBQWpCLENBQTJCbUQsaUJBQS9DLEtBQ0gsS0FBSzVGLENBQUwsQ0FBTzBGLEtBQVAsQ0FBYUMsTUFBYixDQUFvQixLQUFLM0YsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUEyQm9ELHVCQUEvQyxDQURHLEtBR0MsQ0FBQyxLQUFLdkYsV0FBTixJQUNDLEtBQUtBLFdBQUwsSUFDRyxLQUFLQSxXQUFMLEtBQXFCK0IsV0FBQSxDQUFHQyxZQUFILENBQ2pCLEtBQUt0QyxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJDLFNBQWpCLENBQTJCb0QsdUJBRFYsRUFDbUMsT0FEbkMsQ0FMMUIsQ0FBUDtJQVVIOztJQUNELE9BQU8sS0FBSzdGLENBQUwsQ0FBTzBGLEtBQVAsQ0FBYUMsTUFBYixDQUFvQixLQUFLM0YsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUEyQnFELHFCQUEvQyxNQUVDLENBQUMsS0FBS3hGLFdBQU4sSUFDQyxLQUFLQSxXQUFMLElBQ0csS0FBS0EsV0FBTCxLQUFxQitCLFdBQUEsQ0FBR0MsWUFBSCxDQUNqQixLQUFLdEMsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUEyQnFELHFCQURWLEVBQ2lDLE9BRGpDLENBSjFCLENBQVA7RUFTSDtFQUVEO0FBQ0o7QUFDQTtBQUNBOzs7RUFDc0IsTUFBWkMsWUFBWSxHQUFHO0lBQ2pCLE1BQU1DLElBQUksR0FBSSxLQUFLaEcsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXcUIsT0FBWCxDQUFtQm9DLElBQXBCLEdBQTRCLEtBQUtoRyxDQUFMLENBQU91QyxHQUFQLENBQVdxQixPQUFYLENBQW1Cb0MsSUFBL0MsR0FBc0QsSUFBbkU7SUFDQSxLQUFLL0YsR0FBTCxDQUFTbUIsSUFBVCxDQUFjLHNCQUFkO0lBQ0EsTUFBTTZFLEdBQUcsR0FBRyxNQUFNLElBQUFDLGtCQUFBLEVBQU8sb0JBQW1CRixJQUFLLHVCQUEvQixDQUFsQjtJQUNBLE1BQU1HLElBQUksR0FBRyxNQUFNRixHQUFHLENBQUNFLElBQUosRUFBbkIsQ0FKaUIsQ0FLakI7O0lBQ0EsSUFBSSxDQUFDQSxJQUFJLENBQUNyRCxPQUFMLENBQWEsbUJBQWIsQ0FBTCxFQUF3QztNQUNwQyxPQUFPcUQsSUFBUDtJQUNIOztJQUNELE9BQU8sS0FBUDtFQUNIO0VBRUQ7QUFDSjtBQUNBO0FBQ0E7OztFQUN5QixNQUFmQyxlQUFlLEdBQUc7SUFDcEIsTUFBTUosSUFBSSxHQUFJLEtBQUtoRyxDQUFMLENBQU91QyxHQUFQLENBQVdxQixPQUFYLENBQW1Cb0MsSUFBcEIsR0FBNEIsS0FBS2hHLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV3FCLE9BQVgsQ0FBbUJvQyxJQUEvQyxHQUFzRCxJQUFuRTtJQUNBLEtBQUsvRixHQUFMLENBQVNtQixJQUFULENBQWMseUJBQWQ7SUFDQSxNQUFNNkUsR0FBRyxHQUFHLE1BQU0sSUFBQUMsa0JBQUEsRUFDYixvQkFBbUJGLElBQUssdURBRFgsQ0FBbEI7SUFHQSxNQUFNRyxJQUFJLEdBQUcsTUFBTUYsR0FBRyxDQUFDRSxJQUFKLEVBQW5CO0lBQ0EsT0FBT0UsSUFBSSxDQUFDQyxLQUFMLENBQVdILElBQVgsQ0FBUDtFQUNIO0VBRUQ7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0VBQ0lJLGlCQUFpQixHQUFHO0lBQ2hCLE1BQU1DLFdBQVcsR0FDWixLQUFLM0YsaUJBQUwsS0FBMkIsS0FBS0MsbUJBQUwsQ0FBeUJDLHdCQUFyRCxHQUNJLEtBQUtmLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV0MsS0FBWCxDQUFpQkMsU0FBakIsQ0FBMkJvRCx1QkFEL0IsR0FFSSxLQUFLN0YsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUEyQnFELHFCQUhuQzs7SUFLQSxJQUFJLEtBQUs5RixDQUFMLENBQU8wRixLQUFQLENBQWFDLE1BQWIsQ0FBb0JhLFdBQXBCLENBQUosRUFBc0M7TUFDbEMsS0FBS2xHLFdBQUwsR0FBbUIrQixXQUFBLENBQUdDLFlBQUgsQ0FBZ0JrRSxXQUFoQixFQUE2QixPQUE3QixDQUFuQjtJQUNIOztJQUVELE9BQU8sSUFBSTVCLE9BQUosQ0FBWSxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7TUFDcEMsTUFBTTJCLElBQUksR0FBRyxJQUFiO01BQ0EsSUFBSXhHLEdBQUcsR0FBRyxFQUFWO01BQ0EsSUFBSXlHLFdBQVcsR0FBRyxLQUFsQjtNQUNBLElBQUlDLFlBQVksR0FBRyxJQUFuQjtNQUNBLElBQUlDLFlBQVksR0FBRyxJQUFuQjtNQUNBLElBQUlDLGNBQWMsR0FBRyxJQUFyQjtNQUNBLElBQUlDLFdBQVcsR0FBRyxJQUFsQjtNQUNBLElBQUlDLG9CQUFvQixHQUFHLElBQTNCO01BQ0EsSUFBSUMsV0FBVyxHQUFHLEtBQWxCOztNQUVBLFNBQVNDLFdBQVQsQ0FBcUJDLEdBQXJCLEVBQTBCO1FBQ3RCVCxJQUFJLENBQUN4RyxHQUFMLENBQVNxRSxLQUFULENBQWdCLGdCQUFlNEMsR0FBSSxFQUFuQzs7UUFDQW5DLG1CQUFBLENBQU1vQyxJQUFOLENBQVcsVUFBWCxFQUF1QixDQUFDLE1BQUQsRUFBU0QsR0FBVCxFQUFjLElBQWQsRUFBb0IsSUFBcEIsQ0FBdkIsRUFGc0IsQ0FJdEI7UUFDQTtRQUNBOzs7UUFFQSxNQUFNRSxHQUFHLEdBQUdyQyxtQkFBQSxDQUNQb0MsSUFETyxDQUVKLE1BRkksRUFHSixDQUFDLFNBQUQsRUFBWSxPQUFaLEVBQXFCLG9CQUFyQixFQUEyQyxLQUEzQyxFQUFrRCx1QkFBbEQsQ0FISSxFQUtQdEgsTUFMTyxDQUtBd0gsUUFMQSxDQUtTLE9BTFQsRUFNUDNFLEtBTk8sQ0FNRCxJQU5DLENBQVo7O1FBT0EsTUFBTTRFLElBQUksR0FBR2IsSUFBSSxDQUFDYyxnQkFBTCxFQUFiLENBZnNCLENBZ0J0Qjs7UUFDQSxNQUFNQyxPQUFPLEdBQUcsSUFBSTlHLE1BQUosQ0FBWSxHQUFFNEcsSUFBSSxDQUFDN0gsSUFBTCxDQUFVLE1BQVYsQ0FBa0IsWUFBaEMsRUFBNkMsSUFBN0MsQ0FBaEI7UUFDQSxNQUFNZ0ksT0FBTyxHQUFHLElBQUkvRyxNQUFKLENBQVksSUFBRzRHLElBQUksQ0FBQzdILElBQUwsQ0FBVSxRQUFWLENBQW9CLGFBQW5DLEVBQWlELElBQWpELENBQWhCLENBbEJzQixDQW1CdEI7O1FBQ0EySCxHQUFHLENBQUNNLE9BQUosQ0FBYUMsSUFBRCxJQUFVO1VBQ2xCLE1BQU1wRSxLQUFLLEdBQUdpRSxPQUFPLENBQUNJLElBQVIsQ0FBYUQsSUFBYixLQUFzQkYsT0FBTyxDQUFDRyxJQUFSLENBQWFELElBQWIsQ0FBdEIsSUFBNEMsS0FBMUQ7O1VBQ0EsSUFBSXBFLEtBQUosRUFBVztZQUNQa0QsSUFBSSxDQUFDeEcsR0FBTCxDQUFTcUUsS0FBVCxDQUFnQixnQkFBZWYsS0FBSyxDQUFDLENBQUQsQ0FBSSxFQUF4Qzs7WUFDQXdCLG1CQUFBLENBQU1vQyxJQUFOLENBQVcsVUFBWCxFQUF1QixDQUFDLE1BQUQsRUFBUzVELEtBQUssQ0FBQyxDQUFELENBQWQsRUFBbUIsSUFBbkIsRUFBeUIsSUFBekIsQ0FBdkI7VUFDSDs7VUFDRGlFLE9BQU8sQ0FBQ0ssU0FBUixHQUFvQixDQUFwQjtVQUNBSixPQUFPLENBQUNJLFNBQVIsR0FBb0IsQ0FBcEI7UUFDSCxDQVJEO01BU0g7O01BRUQsU0FBU0MsUUFBVCxHQUFvQjtRQUNoQnpGLFdBQUEsQ0FBR2EsYUFBSCxDQUFpQixZQUFqQixFQUErQmpELEdBQS9CLEVBQW9DLE9BQXBDO01BQ0g7O01BRUQsU0FBUzhILHlCQUFULEdBQXFDO1FBQ2pDQyxhQUFhLENBQUNqQixvQkFBRCxDQUFiO1FBQ0FrQixZQUFZLENBQUN0QixZQUFELENBQVo7UUFDQXNCLFlBQVksQ0FBQ3JCLFlBQUQsQ0FBWjtRQUNBcUIsWUFBWSxDQUFDcEIsY0FBRCxDQUFaO1FBQ0FvQixZQUFZLENBQUNuQixXQUFELENBQVo7TUFDSDs7TUFFRCxNQUFNUSxJQUFJLEdBQUcsS0FBS0MsZ0JBQUwsRUFBYjtNQUVBLEtBQUt0SCxHQUFMLENBQVNtQixJQUFULENBQWUsbUJBQWtCa0csSUFBSSxDQUFDN0gsSUFBTCxDQUFVLEdBQVYsQ0FBZSw4QkFBaEQ7TUFFQSxNQUFNOEMsR0FBRyxHQUFHO1FBQUVpRCxvQkFBb0IsRUFBRSxDQUF4QjtRQUEyQjBDLHVCQUF1QixFQUFFO01BQXBELENBQVo7O01BQ0EsSUFBSSxLQUFLbEksQ0FBTCxDQUFPdUMsR0FBUCxDQUFXcUIsT0FBWCxDQUFtQnVFLFNBQXZCLEVBQWtDO1FBQzlCNUYsR0FBRyxDQUFDNkYsd0JBQUosR0FBK0IsSUFBL0I7TUFDSCxDQTdEbUMsQ0ErRHBDOzs7TUFDQSxNQUFNQyxLQUFLLEdBQUcsSUFBQXRELG1CQUFBLEVBQ1YsUUFEVSxFQUVWdUMsSUFGVSxFQUdWO1FBQ0kvRSxHQUFHLEVBQUUrQyxNQUFNLENBQUNDLE1BQVAsQ0FBY2hELEdBQWQsRUFBbUJ3QixPQUFPLENBQUN4QixHQUEzQixDQURUO1FBRUl5QyxHQUFHLEVBQUUsS0FBS2hGLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV0MsS0FBWCxDQUFpQkMsU0FBakIsQ0FBMkJ3QztNQUZwQyxDQUhVLEVBT1Y7UUFBRXFELEtBQUssRUFBRTtNQUFULENBUFUsQ0FBZCxDQWhFb0MsQ0EwRXBDOztNQUNBLFNBQVNDLElBQVQsR0FBZ0I7UUFDWjVJLEdBQUcsQ0FBQyxFQUFELENBQUg7UUFDQTBJLEtBQUssQ0FBQ0UsSUFBTixDQUFXLFNBQVg7O1FBQ0EsSUFBSTlCLElBQUksQ0FBQ3pHLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV2lHLEVBQVgsQ0FBY0MsU0FBbEIsRUFBNkI7VUFDekJ4QixXQUFXLENBQUNvQixLQUFLLENBQUNuQixHQUFQLENBQVg7UUFDSDtNQUNKOztNQUVELFNBQVNsRCxJQUFULEdBQWdCO1FBQ1o4QyxXQUFXLEdBQUc0QixVQUFVLENBQUMsTUFBTTtVQUMzQlgseUJBQXlCO1VBQ3pCckIsV0FBVyxHQUFHLElBQWQ7VUFDQTZCLElBQUk7VUFDSjFELE9BQU87UUFDVixDQUx1QixFQUtyQixHQUxxQixDQUF4QjtNQU1IOztNQUVELFNBQVM4RCxTQUFULEdBQXFCO1FBQ2pCbEMsSUFBSSxDQUFDa0MsU0FBTCxHQUFpQkMsSUFBakIsQ0FBc0IsTUFBTTtVQUN4QjVFLElBQUk7UUFDUCxDQUZELEVBRUc2RSxLQUZILENBRVMsTUFBTTtVQUNYZCx5QkFBeUI7VUFDekJRLElBQUk7VUFDSlQsUUFBUTtVQUNSaEQsTUFBTSxDQUFDLE1BQUQsQ0FBTjtRQUNILENBUEQ7TUFRSDs7TUFFRGlDLG9CQUFvQixHQUFHK0IsV0FBVyxDQUFDLE1BQU07UUFDckM7UUFDQSxJQUFJLEtBQUtyRCxtQkFBTCxFQUFKLEVBQWdDO1VBQzVCO1VBQ0EsSUFBSSxLQUFLNUUsaUJBQUwsS0FDQSxLQUFLQyxtQkFBTCxDQUF5QkMsd0JBRDdCLEVBQ3VEO1lBQ25ENEgsU0FBUztVQUNaO1FBQ0o7TUFDSixDQVRpQyxFQVMvQixJQVQrQixDQUFsQztNQVdBTixLQUFLLENBQUNVLE1BQU4sQ0FBYTVELEVBQWIsQ0FBZ0IsTUFBaEIsRUFBeUI2RCxLQUFELElBQVc7UUFDL0IsTUFBTXJCLElBQUksR0FBR3FCLEtBQUssQ0FBQzNCLFFBQU4sQ0FBZSxPQUFmLENBQWI7UUFDQXBILEdBQUcsSUFBSyxHQUFFMEgsSUFBSyxJQUFmOztRQUNBLElBQUlmLFlBQUosRUFBa0I7VUFDZHFCLFlBQVksQ0FBQ3JCLFlBQUQsQ0FBWjtRQUNILENBTDhCLENBTS9CO1FBQ0E7OztRQUNBLElBQ0ksQ0FBQyxDQUFDZSxJQUFJLENBQUM3RSxPQUFMLENBQWEsY0FBYixDQUFGLElBQ0EsQ0FBQyxDQUFDNkUsSUFBSSxDQUFDN0UsT0FBTCxDQUFhLGlCQUFiLENBREYsSUFFQSxDQUFDLENBQUM2RSxJQUFJLENBQUM3RSxPQUFMLENBQWEsYUFBYixDQUZGLElBR0EsQ0FBQyxDQUFDNkUsSUFBSSxDQUFDN0UsT0FBTCxDQUFhLGNBQWIsQ0FIRixJQUtJbUcsS0FBSyxDQUFDQyxPQUFOLENBQWN6QyxJQUFJLENBQUN6RyxDQUFMLENBQU91QyxHQUFQLENBQVdxQixPQUFYLENBQW1CdUYsWUFBakMsS0FDQTFDLElBQUksQ0FBQ3pHLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV3FCLE9BQVgsQ0FBbUJ1RixZQUFuQixDQUFnQ0MsS0FBaEMsQ0FBc0NDLEdBQUcsSUFBSSxDQUFDLENBQUMxQixJQUFJLENBQUM3RSxPQUFMLENBQWF1RyxHQUFiLENBQS9DLENBUFIsRUFTRTtVQUNFNUMsSUFBSSxDQUFDeEcsR0FBTCxDQUFTd0UsSUFBVCxDQUFjLFNBQWQsRUFBeUJrRCxJQUF6QixFQURGLENBRUU7O1VBQ0FmLFlBQVksR0FBRzhCLFVBQVUsQ0FBQyxNQUFNO1lBQzVCWCx5QkFBeUI7WUFDekJRLElBQUk7WUFDSlQsUUFBUTtZQUNSaEQsTUFBTSxDQUFDLE9BQUQsQ0FBTjtVQUNILENBTHdCLEVBS3RCLElBTHNCLENBQXpCO1FBTUg7TUFDSixDQTNCRDtNQTZCQXVELEtBQUssQ0FBQ3hJLE1BQU4sQ0FBYXNGLEVBQWIsQ0FBZ0IsTUFBaEIsRUFBeUI2RCxLQUFELElBQVc7UUFDL0IsTUFBTXJCLElBQUksR0FBR3FCLEtBQUssQ0FBQzNCLFFBQU4sQ0FBZSxPQUFmLENBQWI7O1FBQ0EsSUFBSSxDQUFDWCxXQUFELElBQWdCaUIsSUFBSSxDQUFDOUUsSUFBTCxHQUFZUSxPQUFaLENBQW9CLGlCQUFwQixFQUF1QyxFQUF2QyxNQUErQyxFQUFuRSxFQUF1RTtVQUNuRSxNQUFNaUcsY0FBYyxHQUFHM0IsSUFBSSxDQUFDOUUsSUFBTCxHQUNsQkgsS0FEa0IsQ0FDWixNQURZLENBQXZCLENBRG1FLENBR25FOztVQUNBLE1BQU02RyxhQUFhLEdBQUdELGNBQWMsQ0FBQ0UsR0FBZixHQUFxQm5HLE9BQXJCLENBQTZCLGlCQUE3QixFQUFnRCxFQUFoRCxDQUF0QjtVQUNBMUQsR0FBRyxDQUFDNEosYUFBRCxDQUFIO1FBQ0g7O1FBQ0R0SixHQUFHLElBQUssR0FBRTBILElBQUssSUFBZjs7UUFDQSxJQUFJLENBQUNBLElBQUksQ0FBQzdFLE9BQUwsQ0FBYSxvQkFBYixDQUFMLEVBQXlDO1VBQ3JDbkQsR0FBRyxDQUFDLEVBQUQsQ0FBSDtVQUNBLEtBQUtNLEdBQUwsQ0FBU21CLElBQVQsQ0FBYyxhQUFkO1FBQ0g7O1FBRUQsSUFBSSxDQUFDdUcsSUFBSSxDQUFDN0UsT0FBTCxDQUFhLHVCQUFiLENBQUwsRUFBNEM7VUFDeEMsSUFBSStELGNBQUosRUFBb0I7WUFDaEJvQixZQUFZLENBQUNwQixjQUFELENBQVo7VUFDSDs7VUFDREEsY0FBYyxHQUFHNkIsVUFBVSxDQUFDLE1BQU07WUFDOUIvSSxHQUFHLENBQUMsRUFBRCxDQUFIO1lBQ0EsS0FBS00sR0FBTCxDQUFTbUIsSUFBVCxDQUFjLHlCQUFkO1VBQ0gsQ0FIMEIsRUFHeEIsSUFId0IsQ0FBM0I7UUFJSDs7UUFFRCxJQUFJLENBQUN1RyxJQUFJLENBQUM3RSxPQUFMLENBQWEsMkJBQWIsQ0FBTCxFQUFnRDtVQUM1Q25ELEdBQUcsQ0FBQyxFQUFELENBQUg7VUFDQSxLQUFLTSxHQUFMLENBQVNtQixJQUFULENBQWMsYUFBZDtRQUNIOztRQUVELElBQUksQ0FBQ3VHLElBQUksQ0FBQzdFLE9BQUwsQ0FBYSx1QkFBYixDQUFMLEVBQTRDO1VBQ3hDa0UsV0FBVyxHQUFHLElBQWQ7UUFDSDs7UUFFRCxJQUFJLENBQUNXLElBQUksQ0FBQzdFLE9BQUwsQ0FBYSw2QkFBYixDQUFMLEVBQWtEO1VBQzlDLElBQUk4RCxZQUFKLEVBQWtCO1lBQ2RxQixZQUFZLENBQUNyQixZQUFELENBQVo7VUFDSDs7VUFDREEsWUFBWSxHQUFHOEIsVUFBVSxDQUFDLE1BQU07WUFDNUJYLHlCQUF5QjtZQUN6QlEsSUFBSTtZQUNKVCxRQUFRO1lBQ1JoRCxNQUFNLENBQUMsWUFBRCxDQUFOO1VBQ0gsQ0FMd0IsRUFLdEIsSUFMc0IsQ0FBekI7UUFNSDs7UUFFRCxJQUFJLENBQUM2QyxJQUFJLENBQUM3RSxPQUFMLENBQWEsZ0JBQWIsQ0FBTCxFQUFxQztVQUNqQzZGLFNBQVM7UUFDWjtNQUNKLENBakRELEVBL0lvQyxDQWtNcEM7O01BQ0FOLEtBQUssQ0FBQ2xELEVBQU4sQ0FBUyxNQUFULEVBQWlCLE1BQU07UUFDbkJ4RixHQUFHLENBQUMsRUFBRCxDQUFIO1FBQ0FvSSx5QkFBeUI7O1FBQ3pCLElBQUksQ0FBQ3JCLFdBQUwsRUFBa0I7VUFDZG9CLFFBQVE7O1VBQ1IsSUFBSWQsV0FBSixFQUFpQjtZQUNibEMsTUFBTSxDQUFDLE1BQUQsQ0FBTjtVQUNILENBRkQsTUFFTztZQUNIQSxNQUFNLENBQUMsTUFBRCxDQUFOO1VBQ0g7UUFDSjtNQUNKLENBWEQ7TUFhQTZCLFlBQVksR0FBRytCLFVBQVUsQ0FBQyxNQUFNO1FBQzVCSCxJQUFJO1FBQ0pULFFBQVE7UUFDUmhELE1BQU0sQ0FBQyxTQUFELENBQU47TUFDSCxDQUp3QixFQUl0QixLQUFLOUUsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXcUIsT0FBWCxDQUFtQitDLFlBQW5CLEdBQWtDLEtBQUszRyxDQUFMLENBQU91QyxHQUFQLENBQVdxQixPQUFYLENBQW1CK0MsWUFBbkIsR0FBa0MsSUFBcEUsR0FBMkUsTUFKckQsQ0FBekI7SUFLSCxDQXJOTSxDQUFQO0VBc05IO0VBRUQ7QUFDSjtBQUNBO0FBQ0E7OztFQUNJOEMsWUFBWSxDQUFDQyxTQUFELEVBQVk7SUFDcEIsSUFBSUMsT0FBSjtJQUNBLElBQUlDLGFBQUo7O0lBRUEsSUFBSTtNQUNBRCxPQUFPLEdBQUd0SCxXQUFBLENBQUdDLFlBQUgsQ0FBZ0JvSCxTQUFoQixFQUEyQixPQUEzQixDQUFWO0lBQ0gsQ0FGRCxDQUVFLE9BQU9wSSxDQUFQLEVBQVU7TUFDUixLQUFLckIsR0FBTCxDQUFTNkQsS0FBVCxDQUFnQixrQ0FBaUN4QyxDQUFDLENBQUN1SSxPQUFRLEVBQTNEO01BQ0E5RixPQUFPLENBQUNDLElBQVIsQ0FBYSxDQUFiO0lBQ0g7O0lBQ0QsSUFBSSxDQUFDLEtBQUt2RCxPQUFMLENBQWFxSixJQUFiLENBQWtCSCxPQUFsQixDQUFMLEVBQWlDO01BQzdCLEtBQUsxSixHQUFMLENBQVM2RCxLQUFULENBQWUsNkNBQWY7TUFDQUMsT0FBTyxDQUFDQyxJQUFSLENBQWEsQ0FBYjtJQUNIOztJQUVELElBQUk7TUFDQSxNQUFNK0YsT0FBTyxHQUFHSixPQUFPLENBQUNwRyxLQUFSLENBQWMsS0FBSzlDLE9BQW5CLENBQWhCO01BQ0FtSixhQUFhLEdBQUd2RCxJQUFJLENBQUNDLEtBQUwsQ0FBVzBELGtCQUFrQixDQUFDRCxPQUFPLENBQUMsQ0FBRCxDQUFSLENBQTdCLENBQWhCO0lBQ0gsQ0FIRCxDQUdFLE9BQU96SSxDQUFQLEVBQVU7TUFDUixLQUFLckIsR0FBTCxDQUFTNkQsS0FBVCxDQUFlLDZDQUFmO01BQ0FDLE9BQU8sQ0FBQ0MsSUFBUixDQUFhLENBQWI7SUFDSDs7SUFFRCxJQUFJLEtBQUtoRSxDQUFMLENBQU91QyxHQUFQLENBQVdxQixPQUFYLENBQW1CcUcsTUFBbkIsQ0FBMEJDLE1BQTFCLENBQWlDLENBQUMsQ0FBbEMsRUFBcUMsQ0FBckMsTUFBNEMsR0FBaEQsRUFBcUQ7TUFDakQsS0FBS2xLLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV3FCLE9BQVgsQ0FBbUJxRyxNQUFuQixJQUE2QixHQUE3QjtJQUNIOztJQUVETCxhQUFhLENBQUNPLFFBQWQsR0FBeUIsS0FBS25LLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV3FCLE9BQVgsQ0FBbUJxRyxNQUE1QztJQUNBTCxhQUFhLENBQUNRLDBCQUFkLEdBQTJDLEtBQUtwSyxDQUFMLENBQU91QyxHQUFQLENBQVdxQixPQUFYLENBQW1CcUcsTUFBOUQ7SUFFQU4sT0FBTyxHQUFHQSxPQUFPLENBQUN0RyxPQUFSLENBQ04sS0FBSzFDLFFBREMsRUFDVSxNQUFLMEosa0JBQWtCLENBQUNoRSxJQUFJLENBQUNpRSxTQUFMLENBQWVWLGFBQWYsQ0FBRCxDQUFnQyxLQURqRSxDQUFWOztJQUlBLElBQUk7TUFDQXZILFdBQUEsQ0FBR2EsYUFBSCxDQUFpQndHLFNBQWpCLEVBQTRCQyxPQUE1QjtJQUNILENBRkQsQ0FFRSxPQUFPckksQ0FBUCxFQUFVO01BQ1IsS0FBS3JCLEdBQUwsQ0FBUzZELEtBQVQsQ0FBZ0Isa0NBQWlDeEMsQ0FBQyxDQUFDdUksT0FBUSxFQUEzRDtNQUNBOUYsT0FBTyxDQUFDQyxJQUFSLENBQWEsQ0FBYjtJQUNIOztJQUNELEtBQUsvRCxHQUFMLENBQVNtQixJQUFULENBQWMsNEVBQ1QsT0FBTSxLQUFLcEIsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXcUIsT0FBWCxDQUFtQnFHLE1BQU8sRUFEckM7RUFFSDtFQUVEO0FBQ0o7QUFDQTtBQUNBOzs7RUFDSTFDLGdCQUFnQixHQUFHO0lBQ2YsTUFBTUQsSUFBSSxHQUFHLENBQUMsS0FBRCxFQUFRLFdBQVIsRUFBc0IsbUJBQWtCLEtBQUt0SCxDQUFMLENBQU91QyxHQUFQLENBQVdxQixPQUFYLENBQW1CcUcsTUFBTyxFQUFsRSxDQUFiOztJQUNBLElBQUksS0FBS2pLLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV2dJLGlCQUFYLEVBQUosRUFBb0M7TUFDaENqRCxJQUFJLENBQUNyRSxJQUFMLENBQVUsY0FBVjtJQUNIOztJQUNEcUUsSUFBSSxDQUFDckUsSUFBTCxDQUFVLElBQVY7O0lBQ0EsSUFBSSxLQUFLakQsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXcUIsT0FBWCxDQUFtQm9DLElBQXZCLEVBQTZCO01BQ3pCc0IsSUFBSSxDQUFDckUsSUFBTCxDQUFVLEtBQUtqRCxDQUFMLENBQU91QyxHQUFQLENBQVdxQixPQUFYLENBQW1Cb0MsSUFBN0I7SUFDSCxDQUZELE1BRU87TUFDSHNCLElBQUksQ0FBQ3JFLElBQUwsQ0FBVSxNQUFWO0lBQ0g7O0lBQ0QsSUFBSSxLQUFLakQsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXcUIsT0FBWCxDQUFtQjRHLGNBQXZCLEVBQXVDO01BQ25DbEQsSUFBSSxDQUFDckUsSUFBTCxDQUFVLFlBQVYsRUFBd0IsS0FBS2pELENBQUwsQ0FBT3VDLEdBQVAsQ0FBV3FCLE9BQVgsQ0FBbUI0RyxjQUEzQztJQUNIOztJQUNELE9BQU9sRCxJQUFQO0VBQ0g7RUFFRDtBQUNKO0FBQ0E7OztFQUNtQixNQUFUcUIsU0FBUyxHQUFHO0lBQ2QsS0FBSzFJLEdBQUwsQ0FBU3FFLEtBQVQsQ0FBZSxvQkFBZjs7SUFDQSxJQUFJO01BQ0EsTUFBTSxLQUFLdEUsQ0FBTCxDQUFPMEYsS0FBUCxDQUFhK0UsYUFBYixDQUEyQixLQUEzQixFQUFrQyxLQUFLekssQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCTyxXQUFqQixDQUE2Qk4sU0FBL0QsQ0FBTjtJQUNILENBRkQsQ0FFRSxPQUFPbkIsQ0FBUCxFQUFVO01BQ1IsTUFBTSxJQUFJQyxLQUFKLENBQVVELENBQVYsQ0FBTjtJQUNIOztJQUVELElBQUlvSixNQUFNLEdBQUcsY0FBYjtJQUNBLElBQUlDLGVBQWUsR0FBRyxFQUF0Qjs7SUFFQSxJQUFJLEtBQUs5SixpQkFBTCxLQUEyQixLQUFLQyxtQkFBTCxDQUF5QkUseUJBQXhELEVBQW1GO01BQy9FMEosTUFBTSxHQUFHLFlBQVQ7TUFDQUMsZUFBZSxHQUFJLEdBQUVqTCxhQUFBLENBQUtrTCxHQUFJLEdBQTlCO01BQ0EsSUFBSWxCLFNBQUo7O01BQ0EsSUFBSTtRQUNBckgsV0FBQSxDQUFHd0ksU0FBSCxDQUFhLEtBQUs3SyxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJPLFdBQWpCLENBQTZCTixTQUExQzs7UUFDQWlILFNBQVMsR0FBRyxNQUFNLEtBQUszRCxZQUFMLEVBQWxCOztRQUNBMUQsV0FBQSxDQUFHYSxhQUFILENBQWlCLEtBQUtsRCxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJPLFdBQWpCLENBQTZCK0gsY0FBOUMsRUFBOERwQixTQUE5RDs7UUFDQSxLQUFLekosR0FBTCxDQUFTbUIsSUFBVCxDQUFjLDREQUFkO01BQ0gsQ0FMRCxDQUtFLE9BQU9FLENBQVAsRUFBVTtRQUNSLEtBQUtyQixHQUFMLENBQVM2RCxLQUFULENBQWUsZ0VBQ1gsc0RBRFcsR0FFWCxvQkFGSixFQUUwQnhDLENBRjFCO1FBR0EsTUFBTUEsQ0FBTjtNQUNIO0lBQ0o7O0lBRUQsTUFBTXlKLFlBQVksR0FBRyxLQUFLL0ssQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUEyQmlJLE1BQTNCLENBQXJCO0lBQ0EsTUFBTTtNQUFFOUU7SUFBRixJQUF3QixLQUFLNUYsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUEvQztJQUNBLE1BQU1vRCx1QkFBdUIsR0FBRyxLQUFLN0YsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUE0QixHQUFFaUksTUFBTyxhQUFyQyxDQUFoQzs7SUFFQSxJQUFJLENBQUMsS0FBSzFLLENBQUwsQ0FBTzBGLEtBQVAsQ0FBYUMsTUFBYixDQUFvQm9GLFlBQXBCLENBQUwsRUFBd0M7TUFDcEMsS0FBSzlLLEdBQUwsQ0FBUzZELEtBQVQsQ0FBZ0IsNEJBQTJCaUgsWUFBYSxFQUF4RDtNQUNBLEtBQUs5SyxHQUFMLENBQVM2RCxLQUFULENBQWUsdURBQWY7TUFDQSxNQUFNLElBQUl2QyxLQUFKLENBQVUsMkJBQVYsQ0FBTjtJQUNIOztJQUVELElBQUksQ0FBQyxLQUFLdkIsQ0FBTCxDQUFPMEYsS0FBUCxDQUFhQyxNQUFiLENBQW9CRSx1QkFBcEIsQ0FBTCxFQUFtRDtNQUMvQyxLQUFLNUYsR0FBTCxDQUFTNkQsS0FBVCxDQUFlLG9EQUNWLEdBQUVpSCxZQUFhLEVBRHBCO01BRUEsS0FBSzlLLEdBQUwsQ0FBUzZELEtBQVQsQ0FBZSx1REFBZjtNQUNBLE1BQU0sSUFBSXZDLEtBQUosQ0FBVSwyQkFBVixDQUFOO0lBQ0g7O0lBRUQsSUFBSSxLQUFLVixpQkFBTCxLQUEyQixLQUFLQyxtQkFBTCxDQUF5QkUseUJBQXhELEVBQW1GO01BQy9FLElBQUksQ0FBQyxLQUFLaEIsQ0FBTCxDQUFPMEYsS0FBUCxDQUFhQyxNQUFiLENBQW9CQyxpQkFBcEIsQ0FBTCxFQUE2QztRQUN6QyxLQUFLM0YsR0FBTCxDQUFTNkQsS0FBVCxDQUFlLG1EQUNWLEdBQUVpSCxZQUFhLEVBRHBCO1FBRUEsS0FBSzlLLEdBQUwsQ0FBUzZELEtBQVQsQ0FBZSx1REFBZjtRQUNBLE1BQU0sSUFBSXZDLEtBQUosQ0FBVSwyQkFBVixDQUFOO01BQ0g7SUFDSjs7SUFFRCxLQUFLdEIsR0FBTCxDQUFTNEIsT0FBVCxDQUFpQixzQkFBakI7O0lBQ0F5RyxnQkFBQSxDQUFNMEMsRUFBTixDQUNJLElBREosRUFDVyxHQUFFRCxZQUFhLEdBQUVKLGVBQWdCLEVBRDVDLEVBQytDLEtBQUszSyxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJPLFdBQWpCLENBQTZCTixTQUQ1RSxFQXZEYyxDQTJEZDtJQUNBOzs7SUFDQTZGLGdCQUFBLENBQU0yQyxLQUFOLENBQ0ksSUFESixFQUNVLEtBRFYsRUFDaUIsS0FBS2pMLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV0MsS0FBWCxDQUFpQk8sV0FBakIsQ0FBNkJOLFNBRDlDOztJQUdBLElBQUksS0FBS3pDLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV2lHLEVBQVgsQ0FBY0MsU0FBbEIsRUFBNkI7TUFDekJILGdCQUFBLENBQU1WLElBQU4sQ0FBWSxhQUFZLEtBQUs1SCxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJPLFdBQWpCLENBQTZCTixTQUFVLEdBQUUvQyxhQUFBLENBQUtrTCxHQUFJLFFBQTFFO0lBQ0g7O0lBRUQsSUFBSSxLQUFLL0osaUJBQUwsS0FBMkIsS0FBS0MsbUJBQUwsQ0FBeUJFLHlCQUF4RCxFQUFtRjtNQUMvRSxJQUFJd0YsV0FBSjs7TUFDQSxJQUFJO1FBQ0FBLFdBQVcsR0FBRyxNQUFNLEtBQUtKLGVBQUwsRUFBcEI7O1FBQ0EvRCxXQUFBLENBQUdhLGFBQUgsQ0FDSSxLQUFLbEQsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCTyxXQUFqQixDQUE2Qm1JLG9CQURqQyxFQUVJN0UsSUFBSSxDQUFDaUUsU0FBTCxDQUFlOUQsV0FBZixFQUE0QixJQUE1QixFQUFrQyxDQUFsQyxDQUZKOztRQUlBLEtBQUt2RyxHQUFMLENBQVNtQixJQUFULENBQWMsK0RBQWQ7TUFDSCxDQVBELENBT0UsT0FBT0UsQ0FBUCxFQUFVO1FBQ1IsS0FBS3JCLEdBQUwsQ0FBUzZELEtBQVQsQ0FBZSxrRUFDWCx1REFEVyxHQUVYLG9CQUZKLEVBRTBCeEMsQ0FGMUI7UUFHQSxNQUFNQSxDQUFOO01BQ0g7SUFDSjs7SUFFRCxLQUFLckIsR0FBTCxDQUFTbUIsSUFBVCxDQUFjLHFDQUFkO0lBRUEsS0FBS25CLEdBQUwsQ0FBU3FFLEtBQVQsQ0FBZSxpQ0FBZjs7SUFDQWdFLGdCQUFBLENBQU0wQyxFQUFOLENBQ0l2TCxJQUFJLENBQUMwTCxTQUFELEVBQVksSUFBWixFQUFrQixVQUFsQixFQUE4QixZQUE5QixDQURSLEVBRUksS0FBS25MLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV0MsS0FBWCxDQUFpQk8sV0FBakIsQ0FBNkJOLFNBRmpDO0VBSUg7RUFFRDtBQUNKO0FBQ0E7OztFQUNJMkksZUFBZSxHQUFHO0lBQ2QsS0FBS25MLEdBQUwsQ0FBU21CLElBQVQsQ0FBYyxxQkFBZDtJQUVBLElBQUlpSyxnQkFBZ0IsR0FBRyxLQUFLckwsQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUEyQm9ELHVCQUFsRDs7SUFDQSxJQUFJLEtBQUtoRixpQkFBTCxLQUEyQixLQUFLQyxtQkFBTCxDQUF5QkUseUJBQXhELEVBQW1GO01BQy9FcUssZ0JBQWdCLEdBQUcsS0FBS3JMLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV0MsS0FBWCxDQUFpQkMsU0FBakIsQ0FBMkJxRCxxQkFBOUM7SUFDSDs7SUFFRCxJQUFJO01BQ0EsTUFBTTtRQUFFd0Y7TUFBRixJQUFlakYsSUFBSSxDQUFDQyxLQUFMLENBQ2pCakUsV0FBQSxDQUFHQyxZQUFILENBQWdCK0ksZ0JBQWhCLEVBQWtDLE9BQWxDLENBRGlCLENBQXJCO01BR0EsSUFBSUUsUUFBUSxHQUFHLEtBQWY7TUFDQSxJQUFJQywwQkFBMEIsR0FBRyxLQUFqQztNQUNBLElBQUlDLE1BQU0sR0FBRyxJQUFiLENBTkEsQ0FRQTtNQUNBO01BQ0E7O01BQ0FILFFBQVEsQ0FBQzVELE9BQVQsQ0FBa0JnRSxJQUFELElBQVU7UUFDdkIsSUFBSUMsWUFBSixDQUR1QixDQUV2Qjs7UUFDQSxJQUFJRCxJQUFJLENBQUNFLElBQUwsS0FBYyxJQUFsQixFQUF3QjtVQUNwQkQsWUFBWSxHQUFHdEosV0FBQSxDQUFHQyxZQUFILENBQ1g3QyxJQUFJLENBQUMsS0FBS08sQ0FBTCxDQUFPdUMsR0FBUCxDQUFXQyxLQUFYLENBQWlCTyxXQUFqQixDQUE2Qk4sU0FBOUIsRUFBeUNpSixJQUFJLENBQUNoTSxJQUE5QyxDQURPLEVBRVgsT0FGVyxDQUFmO1VBSUErTCxNQUFNLEdBQUcsS0FBS2xMLFFBQUwsQ0FBY3NMLG1CQUFkLENBQWtDRixZQUFsQyxDQUFUO1VBRUEsQ0FBQztZQUFFQTtVQUFGLElBQW1CRixNQUFwQjtVQUNBRCwwQkFBMEIsR0FDdEJDLE1BQU0sQ0FBQ0QsMEJBQVAsR0FBb0MsSUFBcEMsR0FBMkNBLDBCQUQvQztVQUVBRCxRQUFRLEdBQUdFLE1BQU0sQ0FBQ0YsUUFBUCxHQUFrQixJQUFsQixHQUF5QkEsUUFBcEM7O1VBRUFsSixXQUFBLENBQUdhLGFBQUgsQ0FDSXpELElBQUksQ0FBQyxLQUFLTyxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJPLFdBQWpCLENBQTZCTixTQUE5QixFQUF5Q2lKLElBQUksQ0FBQ2hNLElBQTlDLENBRFIsRUFDNkRpTSxZQUQ3RDtRQUdIO01BQ0osQ0FuQkQ7O01BcUJBLElBQUksQ0FBQ0osUUFBTCxFQUFlO1FBQ1gsS0FBS3RMLEdBQUwsQ0FBUzZELEtBQVQsQ0FBZSx1Q0FBZjtRQUNBQyxPQUFPLENBQUNDLElBQVIsQ0FBYSxDQUFiO01BQ0g7O01BQ0QsSUFBSSxDQUFDd0gsMEJBQUwsRUFBaUM7UUFDN0IsS0FBS3ZMLEdBQUwsQ0FBUzZELEtBQVQsQ0FBZSxrREFBZjtRQUNBQyxPQUFPLENBQUNDLElBQVIsQ0FBYSxDQUFiO01BQ0g7SUFDSixDQXhDRCxDQXdDRSxPQUFPMUMsQ0FBUCxFQUFVO01BQ1IsS0FBS3JCLEdBQUwsQ0FBUzZELEtBQVQsQ0FBZSw0Q0FBZixFQUE2RHhDLENBQTdEO01BQ0F5QyxPQUFPLENBQUNDLElBQVIsQ0FBYSxDQUFiO0lBQ0g7O0lBQ0QsS0FBSy9ELEdBQUwsQ0FBU21CLElBQVQsQ0FBYyx1QkFBZDtFQUNIO0VBRUQ7QUFDSjtBQUNBOzs7RUFDZSxNQUFMMEssS0FBSyxHQUFHO0lBQ1YsS0FBSzdMLEdBQUwsQ0FBU21CLElBQVQsQ0FBYyxrQ0FBZDs7SUFDQSxJQUFJO01BQ0EsTUFBTSxLQUFLaUQsa0JBQUwsRUFBTjtJQUNILENBRkQsQ0FFRSxPQUFPL0MsQ0FBUCxFQUFVO01BQ1IsS0FBS3JCLEdBQUwsQ0FBUzZELEtBQVQsQ0FBZSxnREFBZixFQUFpRXhDLENBQWpFO01BQ0F5QyxPQUFPLENBQUNDLElBQVIsQ0FBYSxDQUFiO0lBQ0g7O0lBRUQsS0FBSy9ELEdBQUwsQ0FBU21CLElBQVQsQ0FBYyxxQkFBZDs7SUFFQSxJQUFJLENBQUMsS0FBS3BCLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV3FCLE9BQVgsQ0FBbUJDLGVBQXhCLEVBQXlDO01BQ3JDLElBQUk7UUFDQSxNQUFNLEtBQUswQyxpQkFBTCxFQUFOO01BQ0gsQ0FGRCxDQUVFLE9BQU93RixNQUFQLEVBQWU7UUFDYixRQUFRQSxNQUFSO1VBQ0ksS0FBSyxTQUFMO1lBQ0ksS0FBSzlMLEdBQUwsQ0FBUzZELEtBQVQsQ0FDSSw0REFESjtZQUdBOztVQUNKLEtBQUssT0FBTDtZQUNJLEtBQUs3RCxHQUFMLENBQVM2RCxLQUFULENBQ0ksd0ZBQ0EsaUZBREEsR0FFQSw0QkFISjtZQUtBOztVQUNKLEtBQUssWUFBTDtZQUNJLEtBQUs3RCxHQUFMLENBQVM2RCxLQUFULENBQ0ksK0RBQ0EsT0FGSjtZQUlBOztVQUNKLEtBQUssTUFBTDtZQUNJLEtBQUs3RCxHQUFMLENBQVM2RCxLQUFULENBQ0ksdUVBQ0EsK0RBREEsR0FFQSwrQkFISjtZQUtBOztVQUNKLEtBQUssTUFBTDtZQUNJLEtBQUs3RCxHQUFMLENBQVM2RCxLQUFULENBQ0ksb0VBREo7WUFHQTs7VUFDSixLQUFLLE1BQUw7WUFDSSxLQUFLN0QsR0FBTCxDQUFTNkQsS0FBVCxDQUNJLDBDQURKO1lBR0E7O1VBQ0o7WUFDSSxLQUFLN0QsR0FBTCxDQUFTNkQsS0FBVCxDQUFlLDhDQUFmLEVBQStEaUksTUFBL0Q7UUFyQ1I7O1FBdUNBLElBQUksS0FBSzFMLGNBQVQsRUFBeUI7VUFDckIsTUFBTSxLQUFLK0Usb0JBQUwsQ0FBMEIsS0FBSy9FLGNBQS9CLENBQU47UUFDSDs7UUFDRDBELE9BQU8sQ0FBQ0MsSUFBUixDQUFhLENBQWI7TUFDSDtJQUNKLENBaERELE1BZ0RPO01BQ0gsS0FBS25ELGlCQUFMLEdBQXlCLEtBQUtvRCxjQUFMLEVBQXpCOztNQUNBLElBQUk7UUFDQSxNQUFNLEtBQUswRSxTQUFMLEVBQU47TUFDSCxDQUZELENBRUUsT0FBT3JILENBQVAsRUFBVTtRQUNSeUMsT0FBTyxDQUFDQyxJQUFSLENBQWEsQ0FBYjtNQUNIO0lBQ0o7O0lBRUQsS0FBS29ILGVBQUw7SUFFQSxLQUFLWSxZQUFMOztJQUVBLElBQUk7TUFDQSxNQUFNLEtBQUtDLFVBQUwsRUFBTjtJQUNILENBRkQsQ0FFRSxPQUFPM0ssQ0FBUCxFQUFVO01BQ1IsS0FBS3JCLEdBQUwsQ0FBUzZELEtBQVQsQ0FBZSx3Q0FBZjtNQUNBQyxPQUFPLENBQUNDLElBQVIsQ0FBYSxDQUFiO0lBQ0g7O0lBRUQsS0FBSy9ELEdBQUwsQ0FBU21CLElBQVQsQ0FBYyx1QkFBZDs7SUFFQSxJQUFJLEtBQUtmLGNBQVQsRUFBeUI7TUFDckIsTUFBTSxLQUFLK0Usb0JBQUwsQ0FBMEIsS0FBSy9FLGNBQS9CLENBQU47SUFDSDtFQUNKOztFQUVEMkwsWUFBWSxHQUFHO0lBQ1gsSUFBSSxLQUFLaE0sQ0FBTCxDQUFPdUMsR0FBUCxDQUFXcUIsT0FBWCxDQUFtQnFHLE1BQW5CLEtBQThCLElBQWxDLEVBQXdDO01BQ3BDLElBQUk7UUFDQSxLQUFLUixZQUFMLENBQWtCLEtBQUt6SixDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJPLFdBQWpCLENBQTZCK0gsY0FBL0M7TUFDSCxDQUZELENBRUUsT0FBT3hKLENBQVAsRUFBVTtRQUNSLEtBQUtyQixHQUFMLENBQVM2RCxLQUFULENBQWdCLDZDQUE0Q3hDLENBQUMsQ0FBQ3VJLE9BQVEsRUFBdEU7TUFDSDtJQUNKO0VBQ0o7O0VBRURvQyxVQUFVLEdBQUc7SUFDVCxLQUFLaE0sR0FBTCxDQUFTbUIsSUFBVCxDQUFjLG9DQUFkO0lBQ0EsT0FBTyxJQUFJd0QsT0FBSixDQUFZLENBQUNDLE9BQUQsRUFBVUMsTUFBVixLQUNmb0gsYUFBQSxDQUFLQyxhQUFMLENBQ0ksS0FBS25NLENBQUwsQ0FBT3VDLEdBQVAsQ0FBV0MsS0FBWCxDQUFpQk8sV0FBakIsQ0FBNkJOLFNBRGpDLEVBRUkvQyxhQUFBLENBQUtELElBQUwsQ0FBVSxLQUFLTyxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJPLFdBQWpCLENBQTZCa0MsSUFBdkMsRUFBNkMsYUFBN0MsQ0FGSixFQUlLMkQsSUFKTCxDQUlVLE1BQU07TUFDUjtNQUNBO01BQ0F3RCxZQUFZLENBQUMsTUFBTTtRQUNmLEtBQUtuTSxHQUFMLENBQVM0QixPQUFULENBQWlCLG1DQUFqQjtRQUNBLEtBQUs3QixDQUFMLENBQU8wRixLQUFQLENBQ0srRSxhQURMLENBQ21CLEtBRG5CLEVBQzBCLEtBQUt6SyxDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJPLFdBQWpCLENBQTZCTixTQUR2RCxFQUVLbUcsSUFGTCxDQUVVLE1BQU07VUFDUi9ELE9BQU87UUFDVixDQUpMLEVBS0tnRSxLQUxMLENBS1l2SCxDQUFELElBQU87VUFDVndELE1BQU0sQ0FBQ3hELENBQUQsQ0FBTjtRQUNILENBUEw7TUFRSCxDQVZXLENBQVo7SUFXSCxDQWxCTCxDQURHLENBQVA7RUFvQkg7RUFFRDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0VBQ0krSyxNQUFNLENBQUNDLFFBQUQsRUFBV3BILEtBQUssR0FBRyxRQUFuQixFQUE2QkYsR0FBRyxHQUFHLEtBQUtoRixDQUFMLENBQU91QyxHQUFQLENBQVdDLEtBQVgsQ0FBaUJDLFNBQWpCLENBQTJCd0MsSUFBOUQsRUFBb0U7SUFDdEUsT0FBTyxJQUFJTCxPQUFKLENBQVksQ0FBQ0MsT0FBRCxFQUFVQyxNQUFWLEtBQXFCO01BQ3BDLEtBQUs3RSxHQUFMLENBQVM0QixPQUFULENBQWtCLHdCQUF1QnlLLFFBQVEsQ0FBQzdNLElBQVQsQ0FBYyxHQUFkLENBQW1CLEVBQTVEO01BRUEsSUFBQXNGLG1CQUFBLEVBQU0sUUFBTixFQUFnQixDQUFDLEtBQUQsRUFBUSxHQUFHdUgsUUFBWCxDQUFoQixFQUFzQztRQUNsQ3RILEdBRGtDO1FBRWxDRTtNQUZrQyxDQUF0QyxFQUdHQyxFQUhILENBR00sTUFITixFQUdjb0gsSUFBSSxJQUNiQSxJQUFJLEtBQUssQ0FBVixHQUFlMUgsT0FBTyxFQUF0QixHQUEyQkMsTUFBTSxDQUFDLElBQUl2RCxLQUFKLENBQVcscUJBQW9CZ0wsSUFBSyxFQUFwQyxDQUFELENBSnJDO0lBTUgsQ0FUTSxDQUFQO0VBVUg7O0FBMTRCMEIifQ==