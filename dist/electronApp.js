"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _runtime = _interopRequireDefault(require("regenerator-runtime/runtime"));

var _asar = _interopRequireDefault(require("@electron/asar"));

var _assignIn = _interopRequireDefault(require("lodash/assignIn"));

var _lodash = _interopRequireDefault(require("lodash"));

var _installLocal = require("install-local");

var _core = require("@babel/core");

var _crypto = _interopRequireDefault(require("crypto"));

var _del = _interopRequireDefault(require("del"));

var _presetEnv = _interopRequireDefault(require("@babel/preset-env"));

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _shelljs = _interopRequireDefault(require("shelljs"));

var _semver = _interopRequireDefault(require("semver"));

var _terser = _interopRequireDefault(require("terser"));

var _log = _interopRequireDefault(require("./log"));

var _electronAppScaffold = _interopRequireDefault(require("./electronAppScaffold"));

var _dependenciesManager = _interopRequireDefault(require("./dependenciesManager"));

var _binaryModulesDetector = _interopRequireDefault(require("./binaryModulesDetector"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// eslint-disable-next-line no-unused-vars
_shelljs.default.config.fatal = true;
/**
 * Represents the .desktop dir scaffold.
 * @class
 */

class ElectronApp {
  /**
   * @param {MeteorDesktop} $ - context
   * @constructor
   */
  constructor($) {
    this.log = new _log.default('electronApp');
    this.scaffold = new _electronAppScaffold.default($);
    this.depsManager = new _dependenciesManager.default($, this.scaffold.getDefaultPackageJson().dependencies);
    this.$ = $;
    this.meteorApp = this.$.meteorApp;
    this.packageJson = null;
    this.version = null;
    this.compatibilityVersion = null;
    this.deprectatedPlugins = ['meteor-desktop-localstorage'];
  }
  /**
   * Makes an app.asar from the skeleton app.
   * @property {Array} excludeFromDel - list of paths to exclude from deleting
   * @returns {Promise}
   */


  packSkeletonToAsar(excludeFromDel = []) {
    this.log.info('packing skeleton app and node_modules to asar archive');
    return new Promise(resolve => {
      const extract = this.getModulesToExtract(); // We want to pack skeleton app and node_modules together, so we need to temporarily
      // move node_modules to app dir.

      this.log.debug('moving node_modules to app dir');

      _fs.default.renameSync(this.$.env.paths.electronApp.nodeModules, _path.default.join(this.$.env.paths.electronApp.appRoot, 'node_modules'));

      let extracted = false;
      extracted = this.extractModules(extract);
      this.log.debug('packing');

      _asar.default.createPackage(this.$.env.paths.electronApp.appRoot, this.$.env.paths.electronApp.appAsar).then(() => {
        // Lets move the node_modules back.
        this.log.debug('moving node_modules back from app dir');

        _shelljs.default.mv(_path.default.join(this.$.env.paths.electronApp.appRoot, 'node_modules'), this.$.env.paths.electronApp.nodeModules);

        if (extracted) {
          // We need to create a full node modules back. In other words we want
          // the extracted modules back.
          extract.forEach(module => _shelljs.default.cp('-rf', _path.default.join(this.$.env.paths.electronApp.extractedNodeModules, module), _path.default.join(this.$.env.paths.electronApp.nodeModules, module))); // Get the .bin back.

          if (this.$.utils.exists(this.$.env.paths.electronApp.extractedNodeModulesBin)) {
            _shelljs.default.cp(_path.default.join(this.$.env.paths.electronApp.extractedNodeModulesBin, '*'), _path.default.join(this.$.env.paths.electronApp.nodeModules, '.bin'));
          }
        }

        this.log.debug('deleting source files');
        const exclude = [this.$.env.paths.electronApp.nodeModules].concat([this.$.env.paths.electronApp.appAsar, this.$.env.paths.electronApp.packageJson], excludeFromDel);

        _del.default.sync([`${this.$.env.paths.electronApp.root}${_path.default.sep}*`].concat(exclude.map(pathToExclude => `!${pathToExclude}`)), {
          force: true
        });

        resolve();
      });
    });
  }
  /**
   * Moves specified node modules to a separate directory.
   * @param {Array} extract
   * @returns {boolean}
   */


  extractModules(extract) {
    const ext = ['.js', '.bat', '.sh', '.cmd', ''];

    if (extract.length > 0) {
      if (this.$.utils.exists(this.$.env.paths.electronApp.extractedNodeModules)) {
        _shelljs.default.rm('-rf', this.$.env.paths.electronApp.extractedNodeModules);
      }

      _fs.default.mkdirSync(this.$.env.paths.electronApp.extractedNodeModules);

      _fs.default.mkdirSync(this.$.env.paths.electronApp.extractedNodeModulesBin);

      extract.forEach(module => {
        _fs.default.renameSync(_path.default.join(this.$.env.paths.electronApp.appRoot, 'node_modules', module), _path.default.join(this.$.env.paths.electronApp.extractedNodeModules, module)); // Move bins.


        this.extractBin(module, ext);
      });
      return true;
    }

    return false;
  }
  /**
   * Extracts the bin files associated with a certain node modules.
   *
   * @param module
   * @param ext
   */


  extractBin(module, ext) {
    let packageJson;

    try {
      packageJson = JSON.parse(_fs.default.readFileSync(_path.default.join(this.$.env.paths.electronApp.extractedNodeModules, module, 'package.json'), 'utf8'));
    } catch (e) {
      packageJson = {};
    }

    const bins = 'bin' in packageJson && typeof packageJson.bin === 'object' ? Object.keys(packageJson.bin) : [];

    if (bins.length > 0) {
      bins.forEach(bin => {
        ext.forEach(extension => {
          const binFilePath = _path.default.join(this.$.env.paths.electronApp.appRoot, 'node_modules', '.bin', `${bin}${extension}`);

          if (this.$.utils.exists(binFilePath) || this.$.utils.symlinkExists(binFilePath)) {
            _fs.default.renameSync(binFilePath, _path.default.join(this.$.env.paths.electronApp.extractedNodeModulesBin, `${bin}${extension}`));
          }
        });
      });
    }
  }
  /**
   * Merges the `extract` field with automatically detected modules.
   */


  getModulesToExtract() {
    const binaryModulesDetector = new _binaryModulesDetector.default(this.$.env.paths.electronApp.nodeModules);
    const toBeExtracted = binaryModulesDetector.detect();
    let {
      extract
    } = this.$.desktop.getSettings();

    if (!Array.isArray(extract)) {
      extract = [];
    }

    const merge = {};
    toBeExtracted.concat(extract).forEach(module => {
      merge[module] = true;
    });
    extract = Object.keys(merge);

    if (extract.length > 0) {
      this.log.verbose(`resultant modules to extract list is: ${extract.join(', ')}`);
    }

    return extract;
  }
  /**
   * Calculates a md5 from all dependencies.
   */


  calculateCompatibilityVersion() {
    this.log.verbose('calculating compatibility version');
    const settings = this.$.desktop.getSettings();

    if ('desktopHCPCompatibilityVersion' in settings) {
      this.compatibilityVersion = `${settings.desktopHCPCompatibilityVersion}`;
      this.log.warn(`compatibility version overridden to ${this.compatibilityVersion}`);
      return;
    }

    const md5 = _crypto.default.createHash('md5');

    let dependencies = this.depsManager.getDependencies();
    const dependenciesSorted = Object.keys(dependencies).sort();
    dependencies = dependenciesSorted.map(dependency => `${dependency}:${dependencies[dependency]}`);
    const mainCompatibilityVersion = this.$.getVersion().split('.');
    this.log.debug('meteor-desktop compatibility version is ', `${mainCompatibilityVersion[0]}`);
    dependencies.push(`meteor-desktop:${mainCompatibilityVersion[0]}`);
    const desktopCompatibilityVersion = settings.version.split('.')[0];
    this.log.debug('.desktop compatibility version is ', desktopCompatibilityVersion);
    dependencies.push(`desktop-app:${desktopCompatibilityVersion}`);

    if (process.env.METEOR_DESKTOP_DEBUG_DESKTOP_COMPATIBILITY_VERSION || process.env.METEOR_DESKTOP_DEBUG) {
      this.log.debug(`compatibility version calculated from ${JSON.stringify(dependencies)}`);
    }

    md5.update(JSON.stringify(dependencies));
    this.compatibilityVersion = md5.digest('hex');
  }

  async init() {
    try {
      await this.$.electron.init();
      await this.$.electronBuilder.init();
    } catch (e) {
      this.log.warn('error occurred while initialising electron and electron-builder integration', e);
      process.exit(1);
    }
  }
  /**
   * Runs all necessary tasks to build the desktopified app.
   */


  async build(run = false) {
    // TODO: refactor to a task runner
    this.log.info('scaffolding');

    if (!this.$.desktop.check()) {
      if (!this.$.env.options.scaffold) {
        this.log.error('seems that you do not have a .desktop dir in your project or it is' + ' corrupted. Run \'npm run desktop -- init\' to get a new one.'); // Do not fail, so that npm will not print his error stuff to console.

        process.exit(0);
      } else {
        this.$.desktop.scaffold();
        this.$.meteorApp.updateGitIgnore();
      }
    }

    await this.init();

    try {
      this.$.meteorApp.updateGitIgnore();
    } catch (e) {
      this.log.warn(`error occurred while adding ${this.$.env.paths.electronApp.rootName}` + 'to .gitignore: ', e);
    }

    try {
      await this.$.meteorApp.removeDeprecatedPackages();
    } catch (e) {
      this.log.error('error while removing deprecated packages: ', e);
      process.exit(1);
    }

    try {
      await this.$.meteorApp.ensureDesktopHCPPackages();
    } catch (e) {
      this.log.error('error while checking for required packages: ', e);
      process.exit(1);
    }

    try {
      await this.scaffold.make();
    } catch (e) {
      this.log.error('error while scaffolding: ', e);
      process.exit(1);
    }

    try {
      const fileName = '.npmrc';
      const dirName = '.meteor/desktop-build';

      if (_fs.default.existsSync(dirName) && _fs.default.existsSync(fileName)) {
        _fs.default.copyFileSync(fileName, `${dirName}/${fileName}`);
      }
    } catch (e) {
      this.log.warn('error while copying .npmrc', e);
    }

    try {
      await this.exposeElectronModules();
    } catch (e) {
      this.log.error('error while exposing electron modules: ', e);
      process.exit(1);
    }

    try {
      this.updatePackageJsonFields();
    } catch (e) {
      this.log.error('error while updating package.json: ', e);
    }

    try {
      this.updateDependenciesList();
    } catch (e) {
      this.log.error('error while merging dependencies list: ', e);
    }

    try {
      this.calculateCompatibilityVersion();
    } catch (e) {
      this.log.error('error while calculating compatibility version: ', e);
      process.exit(1);
    }

    try {
      await this.handleTemporaryNodeModules();
    } catch (e) {
      this.log.error('error occurred while handling temporary node_modules: ', e);
      process.exit(1);
    }

    let nodeModulesRemoved;

    try {
      nodeModulesRemoved = await this.handleStateOfNodeModules();
    } catch (e) {
      this.log.error('error occurred while clearing node_modules: ', e);
      process.exit(1);
    }

    try {
      await this.rebuildDeps(true);
    } catch (e) {
      this.log.error('error occurred while installing node_modules: ', e);
      process.exit(1);
    }

    if (!nodeModulesRemoved) {
      try {
        await this.rebuildDeps();
      } catch (e) {
        this.log.error('error occurred while rebuilding native node modules: ', e);
        process.exit(1);
      }
    }

    try {
      await this.linkNpmPackages();
    } catch (e) {
      this.log.error(`linking packages failed: ${e}`);
      process.exit(1);
    }

    try {
      await this.installLocalNodeModules();
    } catch (e) {
      this.log.error('error occurred while installing local node modules: ', e);
      process.exit(1);
    }

    try {
      await this.ensureMeteorDependencies();
    } catch (e) {
      this.log.error('error occurred while ensuring meteor dependencies are installed: ', e);
      process.exit(1);
    }

    if (this.$.env.isProductionBuild()) {
      try {
        await this.packSkeletonToAsar();
      } catch (e) {
        this.log.error('error while packing skeleton to asar: ', e);
        process.exit(1);
      }
    } // TODO: find a way to avoid copying .desktop to a temp location


    try {
      this.copyDesktopToDesktopTemp();
    } catch (e) {
      this.log.error('error while copying .desktop to a temporary location: ', e);
      process.exit(1);
    }

    try {
      await this.updateSettingsJsonFields();
    } catch (e) {
      this.log.error('error while updating settings.json: ', e);
      process.exit(1);
    }

    try {
      await this.excludeFilesFromArchive();
    } catch (e) {
      this.log.error('error while excluding files from packing to asar: ', e);
      process.exit(1);
    }

    try {
      await this.transpileAndMinify();
    } catch (e) {
      this.log.error('error while transpiling or minifying: ', e);
    }

    try {
      await this.packDesktopToAsar();
    } catch (e) {
      this.log.error('error occurred while packing .desktop to asar: ', e);
      process.exit(1);
    }

    try {
      await this.getMeteorClientBuild();
    } catch (e) {
      this.log.error('error occurred during getting meteor mobile build: ', e);
    }

    if (run) {
      this.log.info('running');
      this.$.electron.run();
    } else {
      this.log.info('built');
    }
  }
  /**
   * Copies the `exposedModules` setting from `settings.json` into `preload.js` modifying its code
   * so that the script will have it hardcoded.
   */


  exposeElectronModules() {
    const {
      exposedModules
    } = this.$.desktop.getSettings();

    if (exposedModules && Array.isArray(exposedModules) && exposedModules.length > 0) {
      let preload = _fs.default.readFileSync(this.$.env.paths.electronApp.preload, 'utf8');

      const modules = this.$.desktop.getSettings().exposedModules.reduce( // eslint-disable-next-line no-return-assign,no-param-reassign
      (prev, module) => (prev += `'${module}', `, prev), '');
      preload = preload.replace('const exposedModules = [', `const exposedModules = [${modules}`);

      _fs.default.writeFileSync(this.$.env.paths.electronApp.preload, preload);
    }
  }
  /**
   * Ensures all required dependencies are added to the Meteor project.
   * @returns {Promise.<void>}
   */


  async ensureMeteorDependencies() {
    let packages = [];
    const packagesWithVersion = [];
    let plugins = 'plugins [';
    Object.keys(this.$.desktop.getDependencies().plugins).forEach(plugin => {
      // Read package.json of the plugin.
      const packageJson = JSON.parse(_fs.default.readFileSync(_path.default.join(this.$.env.paths.electronApp.nodeModules, plugin, 'package.json'), 'utf8'));

      if ('meteorDependencies' in packageJson && typeof packageJson.meteorDependencies === 'object') {
        plugins += `${plugin}, `;
        packages.unshift(...Object.keys(packageJson.meteorDependencies));
        packagesWithVersion.unshift(...packages.map(packageName => {
          if (packageJson.meteorDependencies[packageName] === '@version') {
            return `${packageName}@${packageJson.version}`;
          }

          return `${packageName}@${packageJson.meteorDependencies[packageName]}`;
        }));
      }
    });
    const packagesCount = packages.length;
    packages = packages.filter(value => !this.deprectatedPlugins.includes(value));

    if (packagesCount !== packages.length) {
      this.log.warn('you have some deprecated meteor desktop plugins in your settings, please remove ' + `them (deprecated plugins: ${this.deprectatedPlugins.join(', ')})`);
    }

    if (packages.length > 0) {
      plugins = `${plugins.substr(0, plugins.length - 2)}]`;

      try {
        await this.$.meteorApp.meteorManager.ensurePackages(packages, packagesWithVersion, plugins);
      } catch (e) {
        throw new Error(e);
      }
    }
  }
  /**
   * Builds meteor app.
   */


  async getMeteorClientBuild() {
    await this.$.meteorApp.build();
  }
  /**
   * Removes node_modules if needed.
   * @returns {Promise<void>}
   */


  async handleStateOfNodeModules() {
    if (this.$.env.isProductionBuild() || this.$.env.options.ia32) {
      if (!this.$.env.isProductionBuild()) {
        this.log.info('clearing node_modules because we need to have it clear for ia32 rebuild');
      } else {
        this.log.info('clearing node_modules because this is a production build');
      }

      try {
        await this.$.utils.rmWithRetries('-rf', this.$.env.paths.electronApp.nodeModules);
      } catch (e) {
        throw new Error(e);
      }

      return true;
    }

    return false;
  }
  /**
   * If there is a temporary node_modules folder and no node_modules folder, we will
   * restore it, as it might be a leftover from an interrupted flow.
   * @returns {Promise<void>}
   */


  async handleTemporaryNodeModules() {
    if (this.$.utils.exists(this.$.env.paths.electronApp.tmpNodeModules)) {
      if (!this.$.utils.exists(this.$.env.paths.electronApp.nodeModules)) {
        this.log.debug('moving temp node_modules back');

        _shelljs.default.mv(this.$.env.paths.electronApp.tmpNodeModules, this.$.env.paths.electronApp.nodeModules);
      } else {
        // If there is a node_modules folder, we should clear the temporary one.
        this.log.debug('clearing temp node_modules because new one is already created');

        try {
          await this.$.utils.rmWithRetries('-rf', this.$.env.paths.electronApp.tmpNodeModules);
        } catch (e) {
          throw new Error(e);
        }
      }
    }
  }
  /**
   * Runs npm link for every package specified in settings.json->linkPackages.
   */


  async linkNpmPackages() {
    if (this.$.env.isProductionBuild()) {
      return;
    }

    const settings = this.$.desktop.getSettings();
    const promises = [];

    if ('linkPackages' in this.$.desktop.getSettings()) {
      if (Array.isArray(settings.linkPackages)) {
        settings.linkPackages.forEach(packageName => promises.push(this.$.meteorApp.runNpm(['link', packageName], undefined, this.$.env.paths.electronApp.root)));
      }
    }

    await Promise.all(promises);
  }
  /**
   * Runs npm in the electron app to get the dependencies installed.
   * @returns {Promise}
   */


  async ensureDeps() {
    this.log.info('installing dependencies');

    if (this.$.utils.exists(this.$.env.paths.electronApp.nodeModules)) {
      this.log.debug('running npm prune to wipe unneeded dependencies');

      try {
        await this.runNpm(['prune']);
      } catch (e) {
        throw new Error(e);
      }
    }

    try {
      await this.runNpm(['install'], this.$.env.stdio);
    } catch (e) {
      throw new Error(e);
    }
  }
  /**
   * Warns if plugins version are outdated in compare to the newest scaffold.
   * @param {Object} pluginsVersions - current plugins versions from settings.json
   */


  checkPluginsVersion(pluginsVersions) {
    const settingsJson = JSON.parse(_fs.default.readFileSync(_path.default.join(this.$.env.paths.scaffold, 'settings.json')));
    const scaffoldPluginsVersion = this.$.desktop.getDependencies(settingsJson, false).plugins;
    Object.keys(pluginsVersions).forEach(pluginName => {
      if (pluginName in scaffoldPluginsVersion && scaffoldPluginsVersion[pluginName] !== pluginsVersions[pluginName] && _semver.default.lt(pluginsVersions[pluginName], scaffoldPluginsVersion[pluginName])) {
        this.log.warn(`you are using outdated version ${pluginsVersions[pluginName]} of ` + `${pluginName}, the suggested version to use is ` + `${scaffoldPluginsVersion[pluginName]}`);
      }
    });
  }
  /**
   * Merges core dependency list with the dependencies from .desktop.
   */


  updateDependenciesList() {
    this.log.info('updating list of package.json\'s dependencies');
    const desktopDependencies = this.$.desktop.getDependencies();
    this.checkPluginsVersion(desktopDependencies.plugins);
    this.log.debug('merging settings.json[dependencies]');
    this.depsManager.mergeDependencies('settings.json[dependencies]', desktopDependencies.fromSettings);
    this.log.debug('merging settings.json[plugins]');
    this.depsManager.mergeDependencies('settings.json[plugins]', desktopDependencies.plugins);
    this.log.debug('merging dependencies from modules');
    Object.keys(desktopDependencies.modules).forEach(module => this.depsManager.mergeDependencies(`module[${module}]`, desktopDependencies.modules[module]));
    this.packageJson.dependencies = this.depsManager.getRemoteDependencies();
    this.packageJson.localDependencies = this.depsManager.getLocalDependencies();
    this.log.debug('writing updated package.json');

    _fs.default.writeFileSync(this.$.env.paths.electronApp.packageJson, JSON.stringify(this.packageJson, null, 2));
  }
  /**
   * Install node modules from local paths using local-install.
   *
   * @param {string} arch
   * @returns {Promise}
   */


  installLocalNodeModules(arch = this.$.env.options.ia32 || process.arch === 'ia32' ? 'ia32' : 'x64') {
    const localDependencies = _lodash.default.values(this.packageJson.localDependencies);

    if (localDependencies.length === 0) {
      return Promise.resolve();
    }

    this.log.info('installing local node modules');
    const lastRebuild = this.$.electronBuilder.prepareLastRebuildObject(arch);
    const env = this.$.electronBuilder.getGypEnv(lastRebuild.frameworkInfo, lastRebuild.platform, lastRebuild.arch);
    const installer = new _installLocal.LocalInstaller({
      [this.$.env.paths.electronApp.root]: localDependencies
    }, {
      npmEnv: env
    });
    (0, _installLocal.progress)(installer);
    return installer.install();
  }
  /**
   * Rebuild binary dependencies against Electron's node headers.
   * @returns {Promise}
   */


  rebuildDeps(install = false) {
    if (install) {
      this.log.info('issuing node_modules install from electron-builder');
    } else {
      this.log.info('issuing native modules rebuild from electron-builder');
    }

    const arch = this.$.env.options.ia32 || process.arch === 'ia32' ? 'ia32' : 'x64';

    if (this.$.env.options.ia32) {
      this.log.verbose('forcing rebuild for 32bit');
    } else {
      this.log.verbose(`rebuilding for ${arch}`);
    }

    return this.$.electronBuilder.installOrRebuild(arch, undefined, install);
  }
  /**
   * Update package.json fields accordingly to what is set in settings.json.
   *
   * packageJson.name = settings.projectName
   * packageJson.version = settings.version
   * packageJson.* = settings.packageJsonFields
   */


  updatePackageJsonFields() {
    this.log.verbose('updating package.json fields');
    const settings = this.$.desktop.getSettings();
    /** @type {desktopSettings} */

    const packageJson = this.scaffold.getDefaultPackageJson();
    packageJson.version = settings.version;

    if ('packageJsonFields' in settings) {
      (0, _assignIn.default)(packageJson, settings.packageJsonFields);
    }

    (0, _assignIn.default)(packageJson, {
      name: settings.projectName
    });
    this.log.debug('writing updated package.json');

    _fs.default.writeFileSync(this.$.env.paths.electronApp.packageJson, JSON.stringify(packageJson, null, 4));

    this.packageJson = packageJson;
  }
  /**
   * Updates settings.json with env (prod/dev) information and versions.
   */


  async updateSettingsJsonFields() {
    this.log.debug('updating settings.json fields');
    const settings = this.$.desktop.getSettings(); // Save versions.

    settings.compatibilityVersion = this.compatibilityVersion; // Pass information about build type to the settings.json.

    settings.env = this.$.env.isProductionBuild() ? 'prod' : 'dev';
    const version = await this.$.desktop.getHashVersion();
    settings.desktopVersion = `${version}_${settings.env}`;
    settings.meteorDesktopVersion = this.$.getVersion();

    if (this.$.env.options.prodDebug) {
      settings.prodDebug = true;
    }

    _fs.default.writeFileSync(this.$.env.paths.desktopTmp.settings, JSON.stringify(settings, null, 4));
  }
  /**
   * Copies files from prepared .desktop to desktop.asar in electron app.
   */


  packDesktopToAsar() {
    this.log.info('packing .desktop to asar');
    return new Promise((resolve, reject) => {
      _asar.default.createPackage(this.$.env.paths.desktopTmp.root, this.$.env.paths.electronApp.desktopAsar).then(() => {
        this.log.verbose('clearing temporary .desktop');
        this.$.utils.rmWithRetries('-rf', this.$.env.paths.desktopTmp.root).then(() => {
          resolve();
        }).catch(e => {
          reject(e);
        });
        resolve();
      });
    });
  }
  /**
   * Makes a temporary copy of .desktop.
   */


  copyDesktopToDesktopTemp() {
    this.log.verbose('copying .desktop to temporary location');

    _shelljs.default.cp('-rf', this.$.env.paths.desktop.root, this.$.env.paths.desktopTmp.root); // Remove test files.


    _del.default.sync([_path.default.join(this.$.env.paths.desktopTmp.root, '**', '*.test.js')], {
      force: true
    });
  }
  /**
   * Runs babel and uglify over .desktop if requested.
   */


  async transpileAndMinify() {
    this.log.info('transpiling and uglifying');
    const settings = this.$.desktop.getSettings();
    const options = 'uglifyOptions' in settings ? settings.uglifyOptions : {};
    const uglifyingEnabled = 'uglify' in settings && !!settings.uglify;
    const preset = (0, _presetEnv.default)({
      assertVersion: () => {}
    }, {
      targets: {
        node: '12'
      }
    });
    const {
      data: files
    } = await this.$.utils.readDir(this.$.env.paths.desktopTmp.root);
    files.forEach(file => {
      if (file.endsWith('.js')) {
        let {
          code
        } = (0, _core.transformFileSync)(file, {
          presets: [preset]
        });
        let error;

        if (settings.env === 'prod' && uglifyingEnabled) {
          ({
            code,
            error
          } = _terser.default.minify(code, options));
        }

        if (error) {
          throw new Error(error);
        }

        _fs.default.writeFileSync(file, code);
      }
    });
  }
  /**
   * Moves all the files that should not be packed into asar into a safe location which is the
   * 'extracted' dir in the electron app.
   */


  async excludeFilesFromArchive() {
    this.log.info('excluding files from packing'); // Ensure empty `extracted` dir

    try {
      await this.$.utils.rmWithRetries('-rf', this.$.env.paths.electronApp.extracted);
    } catch (e) {
      throw new Error(e);
    }

    _shelljs.default.mkdir(this.$.env.paths.electronApp.extracted);

    const configs = this.$.desktop.gatherModuleConfigs(); // Move files that should not be asar'ed.

    configs.forEach(config => {
      const moduleConfig = config;

      if ('extract' in moduleConfig) {
        if (!Array.isArray(moduleConfig.extract)) {
          moduleConfig.extract = [moduleConfig.extract];
        }

        moduleConfig.extract.forEach(file => {
          this.log.debug(`excluding ${file} from ${config.name}`);

          const filePath = _path.default.join(this.$.env.paths.desktopTmp.modules, moduleConfig.dirName, file);

          const destinationPath = _path.default.join(this.$.env.paths.electronApp.extracted, moduleConfig.dirName);

          if (!this.$.utils.exists(destinationPath)) {
            _shelljs.default.mkdir(destinationPath);
          }

          _shelljs.default.mv(filePath, destinationPath);
        });
      }
    });
  }

}

exports.default = ElectronApp;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJzaGVsbCIsImNvbmZpZyIsImZhdGFsIiwiRWxlY3Ryb25BcHAiLCJjb25zdHJ1Y3RvciIsIiQiLCJsb2ciLCJMb2ciLCJzY2FmZm9sZCIsIkVsZWN0cm9uQXBwU2NhZmZvbGQiLCJkZXBzTWFuYWdlciIsIkRlcGVuZGVuY2llc01hbmFnZXIiLCJnZXREZWZhdWx0UGFja2FnZUpzb24iLCJkZXBlbmRlbmNpZXMiLCJtZXRlb3JBcHAiLCJwYWNrYWdlSnNvbiIsInZlcnNpb24iLCJjb21wYXRpYmlsaXR5VmVyc2lvbiIsImRlcHJlY3RhdGVkUGx1Z2lucyIsInBhY2tTa2VsZXRvblRvQXNhciIsImV4Y2x1ZGVGcm9tRGVsIiwiaW5mbyIsIlByb21pc2UiLCJyZXNvbHZlIiwiZXh0cmFjdCIsImdldE1vZHVsZXNUb0V4dHJhY3QiLCJkZWJ1ZyIsImZzIiwicmVuYW1lU3luYyIsImVudiIsInBhdGhzIiwiZWxlY3Ryb25BcHAiLCJub2RlTW9kdWxlcyIsInBhdGgiLCJqb2luIiwiYXBwUm9vdCIsImV4dHJhY3RlZCIsImV4dHJhY3RNb2R1bGVzIiwiYXNhciIsImNyZWF0ZVBhY2thZ2UiLCJhcHBBc2FyIiwidGhlbiIsIm12IiwiZm9yRWFjaCIsIm1vZHVsZSIsImNwIiwiZXh0cmFjdGVkTm9kZU1vZHVsZXMiLCJ1dGlscyIsImV4aXN0cyIsImV4dHJhY3RlZE5vZGVNb2R1bGVzQmluIiwiZXhjbHVkZSIsImNvbmNhdCIsImRlbCIsInN5bmMiLCJyb290Iiwic2VwIiwibWFwIiwicGF0aFRvRXhjbHVkZSIsImZvcmNlIiwiZXh0IiwibGVuZ3RoIiwicm0iLCJta2RpclN5bmMiLCJleHRyYWN0QmluIiwiSlNPTiIsInBhcnNlIiwicmVhZEZpbGVTeW5jIiwiZSIsImJpbnMiLCJiaW4iLCJPYmplY3QiLCJrZXlzIiwiZXh0ZW5zaW9uIiwiYmluRmlsZVBhdGgiLCJzeW1saW5rRXhpc3RzIiwiYmluYXJ5TW9kdWxlc0RldGVjdG9yIiwiQmluYXJ5TW9kdWxlRGV0ZWN0b3IiLCJ0b0JlRXh0cmFjdGVkIiwiZGV0ZWN0IiwiZGVza3RvcCIsImdldFNldHRpbmdzIiwiQXJyYXkiLCJpc0FycmF5IiwibWVyZ2UiLCJ2ZXJib3NlIiwiY2FsY3VsYXRlQ29tcGF0aWJpbGl0eVZlcnNpb24iLCJzZXR0aW5ncyIsImRlc2t0b3BIQ1BDb21wYXRpYmlsaXR5VmVyc2lvbiIsIndhcm4iLCJtZDUiLCJjcnlwdG8iLCJjcmVhdGVIYXNoIiwiZ2V0RGVwZW5kZW5jaWVzIiwiZGVwZW5kZW5jaWVzU29ydGVkIiwic29ydCIsImRlcGVuZGVuY3kiLCJtYWluQ29tcGF0aWJpbGl0eVZlcnNpb24iLCJnZXRWZXJzaW9uIiwic3BsaXQiLCJwdXNoIiwiZGVza3RvcENvbXBhdGliaWxpdHlWZXJzaW9uIiwicHJvY2VzcyIsIk1FVEVPUl9ERVNLVE9QX0RFQlVHX0RFU0tUT1BfQ09NUEFUSUJJTElUWV9WRVJTSU9OIiwiTUVURU9SX0RFU0tUT1BfREVCVUciLCJzdHJpbmdpZnkiLCJ1cGRhdGUiLCJkaWdlc3QiLCJpbml0IiwiZWxlY3Ryb24iLCJlbGVjdHJvbkJ1aWxkZXIiLCJleGl0IiwiYnVpbGQiLCJydW4iLCJjaGVjayIsIm9wdGlvbnMiLCJlcnJvciIsInVwZGF0ZUdpdElnbm9yZSIsInJvb3ROYW1lIiwicmVtb3ZlRGVwcmVjYXRlZFBhY2thZ2VzIiwiZW5zdXJlRGVza3RvcEhDUFBhY2thZ2VzIiwibWFrZSIsImZpbGVOYW1lIiwiZGlyTmFtZSIsImV4aXN0c1N5bmMiLCJjb3B5RmlsZVN5bmMiLCJleHBvc2VFbGVjdHJvbk1vZHVsZXMiLCJ1cGRhdGVQYWNrYWdlSnNvbkZpZWxkcyIsInVwZGF0ZURlcGVuZGVuY2llc0xpc3QiLCJoYW5kbGVUZW1wb3JhcnlOb2RlTW9kdWxlcyIsIm5vZGVNb2R1bGVzUmVtb3ZlZCIsImhhbmRsZVN0YXRlT2ZOb2RlTW9kdWxlcyIsInJlYnVpbGREZXBzIiwibGlua05wbVBhY2thZ2VzIiwiaW5zdGFsbExvY2FsTm9kZU1vZHVsZXMiLCJlbnN1cmVNZXRlb3JEZXBlbmRlbmNpZXMiLCJpc1Byb2R1Y3Rpb25CdWlsZCIsImNvcHlEZXNrdG9wVG9EZXNrdG9wVGVtcCIsInVwZGF0ZVNldHRpbmdzSnNvbkZpZWxkcyIsImV4Y2x1ZGVGaWxlc0Zyb21BcmNoaXZlIiwidHJhbnNwaWxlQW5kTWluaWZ5IiwicGFja0Rlc2t0b3BUb0FzYXIiLCJnZXRNZXRlb3JDbGllbnRCdWlsZCIsImV4cG9zZWRNb2R1bGVzIiwicHJlbG9hZCIsIm1vZHVsZXMiLCJyZWR1Y2UiLCJwcmV2IiwicmVwbGFjZSIsIndyaXRlRmlsZVN5bmMiLCJwYWNrYWdlcyIsInBhY2thZ2VzV2l0aFZlcnNpb24iLCJwbHVnaW5zIiwicGx1Z2luIiwibWV0ZW9yRGVwZW5kZW5jaWVzIiwidW5zaGlmdCIsInBhY2thZ2VOYW1lIiwicGFja2FnZXNDb3VudCIsImZpbHRlciIsInZhbHVlIiwiaW5jbHVkZXMiLCJzdWJzdHIiLCJtZXRlb3JNYW5hZ2VyIiwiZW5zdXJlUGFja2FnZXMiLCJFcnJvciIsImlhMzIiLCJybVdpdGhSZXRyaWVzIiwidG1wTm9kZU1vZHVsZXMiLCJwcm9taXNlcyIsImxpbmtQYWNrYWdlcyIsInJ1bk5wbSIsInVuZGVmaW5lZCIsImFsbCIsImVuc3VyZURlcHMiLCJzdGRpbyIsImNoZWNrUGx1Z2luc1ZlcnNpb24iLCJwbHVnaW5zVmVyc2lvbnMiLCJzZXR0aW5nc0pzb24iLCJzY2FmZm9sZFBsdWdpbnNWZXJzaW9uIiwicGx1Z2luTmFtZSIsInNlbXZlciIsImx0IiwiZGVza3RvcERlcGVuZGVuY2llcyIsIm1lcmdlRGVwZW5kZW5jaWVzIiwiZnJvbVNldHRpbmdzIiwiZ2V0UmVtb3RlRGVwZW5kZW5jaWVzIiwibG9jYWxEZXBlbmRlbmNpZXMiLCJnZXRMb2NhbERlcGVuZGVuY2llcyIsImFyY2giLCJfIiwidmFsdWVzIiwibGFzdFJlYnVpbGQiLCJwcmVwYXJlTGFzdFJlYnVpbGRPYmplY3QiLCJnZXRHeXBFbnYiLCJmcmFtZXdvcmtJbmZvIiwicGxhdGZvcm0iLCJpbnN0YWxsZXIiLCJMb2NhbEluc3RhbGxlciIsIm5wbUVudiIsInByb2dyZXNzIiwiaW5zdGFsbCIsImluc3RhbGxPclJlYnVpbGQiLCJhc3NpZ25JbiIsInBhY2thZ2VKc29uRmllbGRzIiwibmFtZSIsInByb2plY3ROYW1lIiwiZ2V0SGFzaFZlcnNpb24iLCJkZXNrdG9wVmVyc2lvbiIsIm1ldGVvckRlc2t0b3BWZXJzaW9uIiwicHJvZERlYnVnIiwiZGVza3RvcFRtcCIsInJlamVjdCIsImRlc2t0b3BBc2FyIiwiY2F0Y2giLCJ1Z2xpZnlPcHRpb25zIiwidWdsaWZ5aW5nRW5hYmxlZCIsInVnbGlmeSIsInByZXNldCIsInByZXNldEVudiIsImFzc2VydFZlcnNpb24iLCJ0YXJnZXRzIiwibm9kZSIsImRhdGEiLCJmaWxlcyIsInJlYWREaXIiLCJmaWxlIiwiZW5kc1dpdGgiLCJjb2RlIiwidHJhbnNmb3JtRmlsZVN5bmMiLCJwcmVzZXRzIiwibWluaWZ5IiwibWtkaXIiLCJjb25maWdzIiwiZ2F0aGVyTW9kdWxlQ29uZmlncyIsIm1vZHVsZUNvbmZpZyIsImZpbGVQYXRoIiwiZGVzdGluYXRpb25QYXRoIl0sInNvdXJjZXMiOlsiLi4vbGliL2VsZWN0cm9uQXBwLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby11bnVzZWQtdmFyc1xuaW1wb3J0IHJlZ2VuZXJhdG9yUnVudGltZSBmcm9tICdyZWdlbmVyYXRvci1ydW50aW1lL3J1bnRpbWUnO1xuaW1wb3J0IGFzYXIgZnJvbSAnQGVsZWN0cm9uL2FzYXInO1xuaW1wb3J0IGFzc2lnbkluIGZyb20gJ2xvZGFzaC9hc3NpZ25Jbic7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IHsgTG9jYWxJbnN0YWxsZXIsIHByb2dyZXNzIH0gZnJvbSAnaW5zdGFsbC1sb2NhbCc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1GaWxlU3luYyB9IGZyb20gJ0BiYWJlbC9jb3JlJztcbmltcG9ydCBjcnlwdG8gZnJvbSAnY3J5cHRvJztcbmltcG9ydCBkZWwgZnJvbSAnZGVsJztcbmltcG9ydCBwcmVzZXRFbnYgZnJvbSAnQGJhYmVsL3ByZXNldC1lbnYnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHNoZWxsIGZyb20gJ3NoZWxsanMnO1xuaW1wb3J0IHNlbXZlciBmcm9tICdzZW12ZXInO1xuaW1wb3J0IHVnbGlmeSBmcm9tICd0ZXJzZXInO1xuXG5pbXBvcnQgTG9nIGZyb20gJy4vbG9nJztcbmltcG9ydCBFbGVjdHJvbkFwcFNjYWZmb2xkIGZyb20gJy4vZWxlY3Ryb25BcHBTY2FmZm9sZCc7XG5pbXBvcnQgRGVwZW5kZW5jaWVzTWFuYWdlciBmcm9tICcuL2RlcGVuZGVuY2llc01hbmFnZXInO1xuaW1wb3J0IEJpbmFyeU1vZHVsZURldGVjdG9yIGZyb20gJy4vYmluYXJ5TW9kdWxlc0RldGVjdG9yJztcblxuc2hlbGwuY29uZmlnLmZhdGFsID0gdHJ1ZTtcblxuLyoqXG4gKiBSZXByZXNlbnRzIHRoZSAuZGVza3RvcCBkaXIgc2NhZmZvbGQuXG4gKiBAY2xhc3NcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRWxlY3Ryb25BcHAge1xuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7TWV0ZW9yRGVza3RvcH0gJCAtIGNvbnRleHRcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcigkKSB7XG4gICAgICAgIHRoaXMubG9nID0gbmV3IExvZygnZWxlY3Ryb25BcHAnKTtcbiAgICAgICAgdGhpcy5zY2FmZm9sZCA9IG5ldyBFbGVjdHJvbkFwcFNjYWZmb2xkKCQpO1xuICAgICAgICB0aGlzLmRlcHNNYW5hZ2VyID0gbmV3IERlcGVuZGVuY2llc01hbmFnZXIoXG4gICAgICAgICAgICAkLFxuICAgICAgICAgICAgdGhpcy5zY2FmZm9sZC5nZXREZWZhdWx0UGFja2FnZUpzb24oKS5kZXBlbmRlbmNpZXNcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy4kID0gJDtcbiAgICAgICAgdGhpcy5tZXRlb3JBcHAgPSB0aGlzLiQubWV0ZW9yQXBwO1xuICAgICAgICB0aGlzLnBhY2thZ2VKc29uID0gbnVsbDtcbiAgICAgICAgdGhpcy52ZXJzaW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5jb21wYXRpYmlsaXR5VmVyc2lvbiA9IG51bGw7XG4gICAgICAgIHRoaXMuZGVwcmVjdGF0ZWRQbHVnaW5zID0gWydtZXRlb3ItZGVza3RvcC1sb2NhbHN0b3JhZ2UnXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNYWtlcyBhbiBhcHAuYXNhciBmcm9tIHRoZSBza2VsZXRvbiBhcHAuXG4gICAgICogQHByb3BlcnR5IHtBcnJheX0gZXhjbHVkZUZyb21EZWwgLSBsaXN0IG9mIHBhdGhzIHRvIGV4Y2x1ZGUgZnJvbSBkZWxldGluZ1xuICAgICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgICAqL1xuICAgIHBhY2tTa2VsZXRvblRvQXNhcihleGNsdWRlRnJvbURlbCA9IFtdKSB7XG4gICAgICAgIHRoaXMubG9nLmluZm8oJ3BhY2tpbmcgc2tlbGV0b24gYXBwIGFuZCBub2RlX21vZHVsZXMgdG8gYXNhciBhcmNoaXZlJyk7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZXh0cmFjdCA9IHRoaXMuZ2V0TW9kdWxlc1RvRXh0cmFjdCgpO1xuXG4gICAgICAgICAgICAvLyBXZSB3YW50IHRvIHBhY2sgc2tlbGV0b24gYXBwIGFuZCBub2RlX21vZHVsZXMgdG9nZXRoZXIsIHNvIHdlIG5lZWQgdG8gdGVtcG9yYXJpbHlcbiAgICAgICAgICAgIC8vIG1vdmUgbm9kZV9tb2R1bGVzIHRvIGFwcCBkaXIuXG4gICAgICAgICAgICB0aGlzLmxvZy5kZWJ1ZygnbW92aW5nIG5vZGVfbW9kdWxlcyB0byBhcHAgZGlyJyk7XG5cbiAgICAgICAgICAgIGZzLnJlbmFtZVN5bmMoXG4gICAgICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5ub2RlTW9kdWxlcyxcbiAgICAgICAgICAgICAgICBwYXRoLmpvaW4odGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5hcHBSb290LCAnbm9kZV9tb2R1bGVzJylcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIGV4dHJhY3RlZCA9IHRoaXMuZXh0cmFjdE1vZHVsZXMoZXh0cmFjdCk7XG5cbiAgICAgICAgICAgIHRoaXMubG9nLmRlYnVnKCdwYWNraW5nJyk7XG4gICAgICAgICAgICBhc2FyLmNyZWF0ZVBhY2thZ2UoXG4gICAgICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5hcHBSb290LFxuICAgICAgICAgICAgICAgIHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAuYXBwQXNhclxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTGV0cyBtb3ZlIHRoZSBub2RlX21vZHVsZXMgYmFjay5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2cuZGVidWcoJ21vdmluZyBub2RlX21vZHVsZXMgYmFjayBmcm9tIGFwcCBkaXInKTtcblxuICAgICAgICAgICAgICAgICAgICBzaGVsbC5tdihcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGguam9pbih0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLmFwcFJvb3QsICdub2RlX21vZHVsZXMnKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubm9kZU1vZHVsZXNcbiAgICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZXh0cmFjdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSBuZWVkIHRvIGNyZWF0ZSBhIGZ1bGwgbm9kZSBtb2R1bGVzIGJhY2suIEluIG90aGVyIHdvcmRzIHdlIHdhbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBleHRyYWN0ZWQgbW9kdWxlcyBiYWNrLlxuICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdC5mb3JFYWNoKG1vZHVsZSA9PiBzaGVsbC5jcChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnLXJmJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoLmpvaW4odGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5leHRyYWN0ZWROb2RlTW9kdWxlcywgbW9kdWxlKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoLmpvaW4odGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5ub2RlTW9kdWxlcywgbW9kdWxlKVxuICAgICAgICAgICAgICAgICAgICAgICAgKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEdldCB0aGUgLmJpbiBiYWNrLlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuJC51dGlscy5leGlzdHMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5leHRyYWN0ZWROb2RlTW9kdWxlc0JpblxuICAgICAgICAgICAgICAgICAgICAgICAgKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNoZWxsLmNwKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoLmpvaW4odGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5leHRyYWN0ZWROb2RlTW9kdWxlc0JpbiwgJyonKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aC5qb2luKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubm9kZU1vZHVsZXMsICcuYmluJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2cuZGVidWcoJ2RlbGV0aW5nIHNvdXJjZSBmaWxlcycpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBleGNsdWRlID0gW3RoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubm9kZU1vZHVsZXNdLmNvbmNhdChcbiAgICAgICAgICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLmFwcEFzYXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5wYWNrYWdlSnNvblxuICAgICAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4Y2x1ZGVGcm9tRGVsXG4gICAgICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAgICAgZGVsLnN5bmMoXG4gICAgICAgICAgICAgICAgICAgICAgICBbYCR7dGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5yb290fSR7cGF0aC5zZXB9KmBdLmNvbmNhdChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGNsdWRlLm1hcChwYXRoVG9FeGNsdWRlID0+IGAhJHtwYXRoVG9FeGNsdWRlfWApXG4gICAgICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBmb3JjZTogdHJ1ZSB9XG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgc3BlY2lmaWVkIG5vZGUgbW9kdWxlcyB0byBhIHNlcGFyYXRlIGRpcmVjdG9yeS5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBleHRyYWN0XG4gICAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAgICovXG4gICAgZXh0cmFjdE1vZHVsZXMoZXh0cmFjdCkge1xuICAgICAgICBjb25zdCBleHQgPSBbJy5qcycsICcuYmF0JywgJy5zaCcsICcuY21kJywgJyddO1xuXG4gICAgICAgIGlmIChleHRyYWN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiQudXRpbHMuZXhpc3RzKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAuZXh0cmFjdGVkTm9kZU1vZHVsZXMpKSB7XG4gICAgICAgICAgICAgICAgc2hlbGwucm0oJy1yZicsIHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAuZXh0cmFjdGVkTm9kZU1vZHVsZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZnMubWtkaXJTeW5jKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAuZXh0cmFjdGVkTm9kZU1vZHVsZXMpO1xuICAgICAgICAgICAgZnMubWtkaXJTeW5jKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAuZXh0cmFjdGVkTm9kZU1vZHVsZXNCaW4pO1xuXG4gICAgICAgICAgICBleHRyYWN0LmZvckVhY2goKG1vZHVsZSkgPT4ge1xuICAgICAgICAgICAgICAgIGZzLnJlbmFtZVN5bmMoXG4gICAgICAgICAgICAgICAgICAgIHBhdGguam9pbih0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLmFwcFJvb3QsICdub2RlX21vZHVsZXMnLCBtb2R1bGUpLFxuICAgICAgICAgICAgICAgICAgICBwYXRoLmpvaW4odGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5leHRyYWN0ZWROb2RlTW9kdWxlcywgbW9kdWxlKSxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIC8vIE1vdmUgYmlucy5cbiAgICAgICAgICAgICAgICB0aGlzLmV4dHJhY3RCaW4obW9kdWxlLCBleHQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeHRyYWN0cyB0aGUgYmluIGZpbGVzIGFzc29jaWF0ZWQgd2l0aCBhIGNlcnRhaW4gbm9kZSBtb2R1bGVzLlxuICAgICAqXG4gICAgICogQHBhcmFtIG1vZHVsZVxuICAgICAqIEBwYXJhbSBleHRcbiAgICAgKi9cbiAgICBleHRyYWN0QmluKG1vZHVsZSwgZXh0KSB7XG4gICAgICAgIGxldCBwYWNrYWdlSnNvbjtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHBhY2thZ2VKc29uID0gSlNPTi5wYXJzZShcbiAgICAgICAgICAgICAgICBmcy5yZWFkRmlsZVN5bmMoXG4gICAgICAgICAgICAgICAgICAgIHBhdGguam9pbihcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAuZXh0cmFjdGVkTm9kZU1vZHVsZXMsIG1vZHVsZSwgJ3BhY2thZ2UuanNvbidcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgICAgJ3V0ZjgnXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcGFja2FnZUpzb24gPSB7fTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgY29uc3QgYmlucyA9ICgnYmluJyBpbiBwYWNrYWdlSnNvbiAmJiB0eXBlb2YgcGFja2FnZUpzb24uYmluID09PSAnb2JqZWN0JykgPyBPYmplY3Qua2V5cyhwYWNrYWdlSnNvbi5iaW4pIDogW107XG5cbiAgICAgICAgaWYgKGJpbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgYmlucy5mb3JFYWNoKChiaW4pID0+IHtcbiAgICAgICAgICAgICAgICBleHQuZm9yRWFjaCgoZXh0ZW5zaW9uKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJpbkZpbGVQYXRoID0gcGF0aC5qb2luKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5hcHBSb290LFxuICAgICAgICAgICAgICAgICAgICAgICAgJ25vZGVfbW9kdWxlcycsXG4gICAgICAgICAgICAgICAgICAgICAgICAnLmJpbicsXG4gICAgICAgICAgICAgICAgICAgICAgICBgJHtiaW59JHtleHRlbnNpb259YFxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy4kLnV0aWxzLmV4aXN0cyhiaW5GaWxlUGF0aCkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuJC51dGlscy5zeW1saW5rRXhpc3RzKGJpbkZpbGVQYXRoKVxuICAgICAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZzLnJlbmFtZVN5bmMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYmluRmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aC5qb2luKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLmV4dHJhY3RlZE5vZGVNb2R1bGVzQmluLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBgJHtiaW59JHtleHRlbnNpb259YFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWVyZ2VzIHRoZSBgZXh0cmFjdGAgZmllbGQgd2l0aCBhdXRvbWF0aWNhbGx5IGRldGVjdGVkIG1vZHVsZXMuXG4gICAgICovXG4gICAgZ2V0TW9kdWxlc1RvRXh0cmFjdCgpIHtcbiAgICAgICAgY29uc3QgYmluYXJ5TW9kdWxlc0RldGVjdG9yID1cbiAgICAgICAgICAgIG5ldyBCaW5hcnlNb2R1bGVEZXRlY3Rvcih0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLm5vZGVNb2R1bGVzKTtcbiAgICAgICAgY29uc3QgdG9CZUV4dHJhY3RlZCA9IGJpbmFyeU1vZHVsZXNEZXRlY3Rvci5kZXRlY3QoKTtcblxuICAgICAgICBsZXQgeyBleHRyYWN0IH0gPSB0aGlzLiQuZGVza3RvcC5nZXRTZXR0aW5ncygpO1xuXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShleHRyYWN0KSkge1xuICAgICAgICAgICAgZXh0cmFjdCA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbWVyZ2UgPSB7fTtcbiAgICAgICAgdG9CZUV4dHJhY3RlZC5jb25jYXQoZXh0cmFjdCkuZm9yRWFjaCgobW9kdWxlKSA9PiB7XG4gICAgICAgICAgICBtZXJnZVttb2R1bGVdID0gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGV4dHJhY3QgPSBPYmplY3Qua2V5cyhtZXJnZSk7XG4gICAgICAgIGlmIChleHRyYWN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHRoaXMubG9nLnZlcmJvc2UoYHJlc3VsdGFudCBtb2R1bGVzIHRvIGV4dHJhY3QgbGlzdCBpczogJHtleHRyYWN0LmpvaW4oJywgJyl9YCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGV4dHJhY3Q7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsY3VsYXRlcyBhIG1kNSBmcm9tIGFsbCBkZXBlbmRlbmNpZXMuXG4gICAgICovXG4gICAgY2FsY3VsYXRlQ29tcGF0aWJpbGl0eVZlcnNpb24oKSB7XG4gICAgICAgIHRoaXMubG9nLnZlcmJvc2UoJ2NhbGN1bGF0aW5nIGNvbXBhdGliaWxpdHkgdmVyc2lvbicpO1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMuJC5kZXNrdG9wLmdldFNldHRpbmdzKCk7XG5cbiAgICAgICAgaWYgKCgnZGVza3RvcEhDUENvbXBhdGliaWxpdHlWZXJzaW9uJyBpbiBzZXR0aW5ncykpIHtcbiAgICAgICAgICAgIHRoaXMuY29tcGF0aWJpbGl0eVZlcnNpb24gPSBgJHtzZXR0aW5ncy5kZXNrdG9wSENQQ29tcGF0aWJpbGl0eVZlcnNpb259YDtcbiAgICAgICAgICAgIHRoaXMubG9nLndhcm4oYGNvbXBhdGliaWxpdHkgdmVyc2lvbiBvdmVycmlkZGVuIHRvICR7dGhpcy5jb21wYXRpYmlsaXR5VmVyc2lvbn1gKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IG1kNSA9IGNyeXB0by5jcmVhdGVIYXNoKCdtZDUnKTtcbiAgICAgICAgbGV0IGRlcGVuZGVuY2llcyA9IHRoaXMuZGVwc01hbmFnZXIuZ2V0RGVwZW5kZW5jaWVzKCk7XG4gICAgICAgIGNvbnN0IGRlcGVuZGVuY2llc1NvcnRlZCA9IE9iamVjdC5rZXlzKGRlcGVuZGVuY2llcykuc29ydCgpO1xuICAgICAgICBkZXBlbmRlbmNpZXMgPSBkZXBlbmRlbmNpZXNTb3J0ZWQubWFwKGRlcGVuZGVuY3kgPT5cbiAgICAgICAgICAgIGAke2RlcGVuZGVuY3l9OiR7ZGVwZW5kZW5jaWVzW2RlcGVuZGVuY3ldfWApO1xuICAgICAgICBjb25zdCBtYWluQ29tcGF0aWJpbGl0eVZlcnNpb24gPSB0aGlzLiQuZ2V0VmVyc2lvbigpLnNwbGl0KCcuJyk7XG4gICAgICAgIHRoaXMubG9nLmRlYnVnKCdtZXRlb3ItZGVza3RvcCBjb21wYXRpYmlsaXR5IHZlcnNpb24gaXMgJyxcbiAgICAgICAgICAgIGAke21haW5Db21wYXRpYmlsaXR5VmVyc2lvblswXX1gKTtcbiAgICAgICAgZGVwZW5kZW5jaWVzLnB1c2goXG4gICAgICAgICAgICBgbWV0ZW9yLWRlc2t0b3A6JHttYWluQ29tcGF0aWJpbGl0eVZlcnNpb25bMF19YFxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnN0IGRlc2t0b3BDb21wYXRpYmlsaXR5VmVyc2lvbiA9IHNldHRpbmdzLnZlcnNpb24uc3BsaXQoJy4nKVswXTtcbiAgICAgICAgdGhpcy5sb2cuZGVidWcoJy5kZXNrdG9wIGNvbXBhdGliaWxpdHkgdmVyc2lvbiBpcyAnLCBkZXNrdG9wQ29tcGF0aWJpbGl0eVZlcnNpb24pO1xuICAgICAgICBkZXBlbmRlbmNpZXMucHVzaChcbiAgICAgICAgICAgIGBkZXNrdG9wLWFwcDoke2Rlc2t0b3BDb21wYXRpYmlsaXR5VmVyc2lvbn1gXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk1FVEVPUl9ERVNLVE9QX0RFQlVHX0RFU0tUT1BfQ09NUEFUSUJJTElUWV9WRVJTSU9OIHx8XG4gICAgICAgICAgICBwcm9jZXNzLmVudi5NRVRFT1JfREVTS1RPUF9ERUJVR1xuICAgICAgICApIHtcbiAgICAgICAgICAgIHRoaXMubG9nLmRlYnVnKGBjb21wYXRpYmlsaXR5IHZlcnNpb24gY2FsY3VsYXRlZCBmcm9tICR7SlNPTi5zdHJpbmdpZnkoZGVwZW5kZW5jaWVzKX1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIG1kNS51cGRhdGUoSlNPTi5zdHJpbmdpZnkoZGVwZW5kZW5jaWVzKSk7XG5cbiAgICAgICAgdGhpcy5jb21wYXRpYmlsaXR5VmVyc2lvbiA9IG1kNS5kaWdlc3QoJ2hleCcpO1xuICAgIH1cblxuICAgIGFzeW5jIGluaXQoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLiQuZWxlY3Ryb24uaW5pdCgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy4kLmVsZWN0cm9uQnVpbGRlci5pbml0KCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRoaXMubG9nLndhcm4oJ2Vycm9yIG9jY3VycmVkIHdoaWxlIGluaXRpYWxpc2luZyBlbGVjdHJvbiBhbmQgZWxlY3Ryb24tYnVpbGRlciBpbnRlZ3JhdGlvbicsIGUpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUnVucyBhbGwgbmVjZXNzYXJ5IHRhc2tzIHRvIGJ1aWxkIHRoZSBkZXNrdG9waWZpZWQgYXBwLlxuICAgICAqL1xuICAgIGFzeW5jIGJ1aWxkKHJ1biA9IGZhbHNlKSB7XG4gICAgICAgIC8vIFRPRE86IHJlZmFjdG9yIHRvIGEgdGFzayBydW5uZXJcbiAgICAgICAgdGhpcy5sb2cuaW5mbygnc2NhZmZvbGRpbmcnKTtcblxuICAgICAgICBpZiAoIXRoaXMuJC5kZXNrdG9wLmNoZWNrKCkpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kLmVudi5vcHRpb25zLnNjYWZmb2xkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ3NlZW1zIHRoYXQgeW91IGRvIG5vdCBoYXZlIGEgLmRlc2t0b3AgZGlyIGluIHlvdXIgcHJvamVjdCBvciBpdCBpcycgK1xuICAgICAgICAgICAgICAgICAgICAnIGNvcnJ1cHRlZC4gUnVuIFxcJ25wbSBydW4gZGVza3RvcCAtLSBpbml0XFwnIHRvIGdldCBhIG5ldyBvbmUuJyk7XG4gICAgICAgICAgICAgICAgLy8gRG8gbm90IGZhaWwsIHNvIHRoYXQgbnBtIHdpbGwgbm90IHByaW50IGhpcyBlcnJvciBzdHVmZiB0byBjb25zb2xlLlxuICAgICAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kLmRlc2t0b3Auc2NhZmZvbGQoKTtcbiAgICAgICAgICAgICAgICB0aGlzLiQubWV0ZW9yQXBwLnVwZGF0ZUdpdElnbm9yZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgdGhpcy5pbml0KCk7XG5cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy4kLm1ldGVvckFwcC51cGRhdGVHaXRJZ25vcmUoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cud2FybihgZXJyb3Igb2NjdXJyZWQgd2hpbGUgYWRkaW5nICR7dGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5yb290TmFtZX1gICtcbiAgICAgICAgICAgICAgICAndG8gLmdpdGlnbm9yZTogJywgZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy4kLm1ldGVvckFwcC5yZW1vdmVEZXByZWNhdGVkUGFja2FnZXMoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ2Vycm9yIHdoaWxlIHJlbW92aW5nIGRlcHJlY2F0ZWQgcGFja2FnZXM6ICcsIGUpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuJC5tZXRlb3JBcHAuZW5zdXJlRGVza3RvcEhDUFBhY2thZ2VzKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKCdlcnJvciB3aGlsZSBjaGVja2luZyBmb3IgcmVxdWlyZWQgcGFja2FnZXM6ICcsIGUpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2NhZmZvbGQubWFrZSgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igd2hpbGUgc2NhZmZvbGRpbmc6ICcsIGUpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lID0gJy5ucG1yYyc7XG4gICAgICAgICAgICBjb25zdCBkaXJOYW1lID0gJy5tZXRlb3IvZGVza3RvcC1idWlsZCc7XG4gICAgICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhkaXJOYW1lKSAmJiBmcy5leGlzdHNTeW5jKGZpbGVOYW1lKSkge1xuICAgICAgICAgICAgICAgIGZzLmNvcHlGaWxlU3luYyhmaWxlTmFtZSwgYCR7ZGlyTmFtZX0vJHtmaWxlTmFtZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cud2FybignZXJyb3Igd2hpbGUgY29weWluZyAubnBtcmMnLCBlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmV4cG9zZUVsZWN0cm9uTW9kdWxlcygpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igd2hpbGUgZXhwb3NpbmcgZWxlY3Ryb24gbW9kdWxlczogJywgZSk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVQYWNrYWdlSnNvbkZpZWxkcygpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igd2hpbGUgdXBkYXRpbmcgcGFja2FnZS5qc29uOiAnLCBlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZURlcGVuZGVuY2llc0xpc3QoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ2Vycm9yIHdoaWxlIG1lcmdpbmcgZGVwZW5kZW5jaWVzIGxpc3Q6ICcsIGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuY2FsY3VsYXRlQ29tcGF0aWJpbGl0eVZlcnNpb24oKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ2Vycm9yIHdoaWxlIGNhbGN1bGF0aW5nIGNvbXBhdGliaWxpdHkgdmVyc2lvbjogJywgZSk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5oYW5kbGVUZW1wb3JhcnlOb2RlTW9kdWxlcygpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igb2NjdXJyZWQgd2hpbGUgaGFuZGxpbmcgdGVtcG9yYXJ5IG5vZGVfbW9kdWxlczogJywgZSk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgbm9kZU1vZHVsZXNSZW1vdmVkO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbm9kZU1vZHVsZXNSZW1vdmVkID0gYXdhaXQgdGhpcy5oYW5kbGVTdGF0ZU9mTm9kZU1vZHVsZXMoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ2Vycm9yIG9jY3VycmVkIHdoaWxlIGNsZWFyaW5nIG5vZGVfbW9kdWxlczogJywgZSk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5yZWJ1aWxkRGVwcyh0cnVlKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ2Vycm9yIG9jY3VycmVkIHdoaWxlIGluc3RhbGxpbmcgbm9kZV9tb2R1bGVzOiAnLCBlKTtcbiAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghbm9kZU1vZHVsZXNSZW1vdmVkKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucmVidWlsZERlcHMoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igb2NjdXJyZWQgd2hpbGUgcmVidWlsZGluZyBuYXRpdmUgbm9kZSBtb2R1bGVzOiAnLCBlKTtcbiAgICAgICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5saW5rTnBtUGFja2FnZXMoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoYGxpbmtpbmcgcGFja2FnZXMgZmFpbGVkOiAke2V9YCk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5pbnN0YWxsTG9jYWxOb2RlTW9kdWxlcygpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igb2NjdXJyZWQgd2hpbGUgaW5zdGFsbGluZyBsb2NhbCBub2RlIG1vZHVsZXM6ICcsIGUpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG5cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5lbnN1cmVNZXRlb3JEZXBlbmRlbmNpZXMoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ2Vycm9yIG9jY3VycmVkIHdoaWxlIGVuc3VyaW5nIG1ldGVvciBkZXBlbmRlbmNpZXMgYXJlIGluc3RhbGxlZDogJywgZSk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGlmICh0aGlzLiQuZW52LmlzUHJvZHVjdGlvbkJ1aWxkKCkpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wYWNrU2tlbGV0b25Ub0FzYXIoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igd2hpbGUgcGFja2luZyBza2VsZXRvbiB0byBhc2FyOiAnLCBlKTtcbiAgICAgICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUT0RPOiBmaW5kIGEgd2F5IHRvIGF2b2lkIGNvcHlpbmcgLmRlc2t0b3AgdG8gYSB0ZW1wIGxvY2F0aW9uXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLmNvcHlEZXNrdG9wVG9EZXNrdG9wVGVtcCgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igd2hpbGUgY29weWluZyAuZGVza3RvcCB0byBhIHRlbXBvcmFyeSBsb2NhdGlvbjogJywgZSk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTZXR0aW5nc0pzb25GaWVsZHMoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ2Vycm9yIHdoaWxlIHVwZGF0aW5nIHNldHRpbmdzLmpzb246ICcsIGUpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZXhjbHVkZUZpbGVzRnJvbUFyY2hpdmUoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ2Vycm9yIHdoaWxlIGV4Y2x1ZGluZyBmaWxlcyBmcm9tIHBhY2tpbmcgdG8gYXNhcjogJywgZSk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy50cmFuc3BpbGVBbmRNaW5pZnkoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2cuZXJyb3IoJ2Vycm9yIHdoaWxlIHRyYW5zcGlsaW5nIG9yIG1pbmlmeWluZzogJywgZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wYWNrRGVza3RvcFRvQXNhcigpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5lcnJvcignZXJyb3Igb2NjdXJyZWQgd2hpbGUgcGFja2luZyAuZGVza3RvcCB0byBhc2FyOiAnLCBlKTtcbiAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmdldE1ldGVvckNsaWVudEJ1aWxkKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRoaXMubG9nLmVycm9yKCdlcnJvciBvY2N1cnJlZCBkdXJpbmcgZ2V0dGluZyBtZXRlb3IgbW9iaWxlIGJ1aWxkOiAnLCBlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChydW4pIHtcbiAgICAgICAgICAgIHRoaXMubG9nLmluZm8oJ3J1bm5pbmcnKTtcbiAgICAgICAgICAgIHRoaXMuJC5lbGVjdHJvbi5ydW4oKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubG9nLmluZm8oJ2J1aWx0Jyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgdGhlIGBleHBvc2VkTW9kdWxlc2Agc2V0dGluZyBmcm9tIGBzZXR0aW5ncy5qc29uYCBpbnRvIGBwcmVsb2FkLmpzYCBtb2RpZnlpbmcgaXRzIGNvZGVcbiAgICAgKiBzbyB0aGF0IHRoZSBzY3JpcHQgd2lsbCBoYXZlIGl0IGhhcmRjb2RlZC5cbiAgICAgKi9cbiAgICBleHBvc2VFbGVjdHJvbk1vZHVsZXMoKSB7XG4gICAgICAgIGNvbnN0IHsgZXhwb3NlZE1vZHVsZXMgfSA9IHRoaXMuJC5kZXNrdG9wLmdldFNldHRpbmdzKCk7XG4gICAgICAgIGlmIChleHBvc2VkTW9kdWxlcyAmJiBBcnJheS5pc0FycmF5KGV4cG9zZWRNb2R1bGVzKSAmJiBleHBvc2VkTW9kdWxlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBsZXQgcHJlbG9hZCA9IGZzLnJlYWRGaWxlU3luYyh0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLnByZWxvYWQsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBtb2R1bGVzID0gdGhpcy4kLmRlc2t0b3AuZ2V0U2V0dGluZ3MoKVxuICAgICAgICAgICAgICAgIC5leHBvc2VkTW9kdWxlc1xuICAgICAgICAgICAgICAgIC5yZWR1Y2UoXG4gICAgICAgICAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXR1cm4tYXNzaWduLG5vLXBhcmFtLXJlYXNzaWduXG4gICAgICAgICAgICAgICAgICAgIChwcmV2LCBtb2R1bGUpID0+IChwcmV2ICs9IGAnJHttb2R1bGV9JywgYCwgcHJldiksICcnXG4gICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgcHJlbG9hZCA9IHByZWxvYWQucmVwbGFjZSgnY29uc3QgZXhwb3NlZE1vZHVsZXMgPSBbJywgYGNvbnN0IGV4cG9zZWRNb2R1bGVzID0gWyR7bW9kdWxlc31gKTtcbiAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmModGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5wcmVsb2FkLCBwcmVsb2FkKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVuc3VyZXMgYWxsIHJlcXVpcmVkIGRlcGVuZGVuY2llcyBhcmUgYWRkZWQgdG8gdGhlIE1ldGVvciBwcm9qZWN0LlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlLjx2b2lkPn1cbiAgICAgKi9cbiAgICBhc3luYyBlbnN1cmVNZXRlb3JEZXBlbmRlbmNpZXMoKSB7XG4gICAgICAgIGxldCBwYWNrYWdlcyA9IFtdO1xuICAgICAgICBjb25zdCBwYWNrYWdlc1dpdGhWZXJzaW9uID0gW107XG4gICAgICAgIGxldCBwbHVnaW5zID0gJ3BsdWdpbnMgWyc7XG5cbiAgICAgICAgT2JqZWN0LmtleXModGhpcy4kLmRlc2t0b3AuZ2V0RGVwZW5kZW5jaWVzKCkucGx1Z2lucykuZm9yRWFjaCgocGx1Z2luKSA9PiB7XG4gICAgICAgICAgICAvLyBSZWFkIHBhY2thZ2UuanNvbiBvZiB0aGUgcGx1Z2luLlxuICAgICAgICAgICAgY29uc3QgcGFja2FnZUpzb24gPVxuICAgICAgICAgICAgICAgIEpTT04ucGFyc2UoXG4gICAgICAgICAgICAgICAgICAgIGZzLnJlYWRGaWxlU3luYyhcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGguam9pbihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLm5vZGVNb2R1bGVzLCBwbHVnaW4sICdwYWNrYWdlLmpzb24nXG4gICAgICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3V0ZjgnXG4gICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoJ21ldGVvckRlcGVuZGVuY2llcycgaW4gcGFja2FnZUpzb24gJiYgdHlwZW9mIHBhY2thZ2VKc29uLm1ldGVvckRlcGVuZGVuY2llcyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBwbHVnaW5zICs9IGAke3BsdWdpbn0sIGA7XG4gICAgICAgICAgICAgICAgcGFja2FnZXMudW5zaGlmdCguLi5PYmplY3Qua2V5cyhwYWNrYWdlSnNvbi5tZXRlb3JEZXBlbmRlbmNpZXMpKTtcbiAgICAgICAgICAgICAgICBwYWNrYWdlc1dpdGhWZXJzaW9uLnVuc2hpZnQoLi4ucGFja2FnZXMubWFwKChwYWNrYWdlTmFtZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAocGFja2FnZUpzb24ubWV0ZW9yRGVwZW5kZW5jaWVzW3BhY2thZ2VOYW1lXSA9PT0gJ0B2ZXJzaW9uJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGAke3BhY2thZ2VOYW1lfUAke3BhY2thZ2VKc29uLnZlcnNpb259YDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYCR7cGFja2FnZU5hbWV9QCR7cGFja2FnZUpzb24ubWV0ZW9yRGVwZW5kZW5jaWVzW3BhY2thZ2VOYW1lXX1gO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgcGFja2FnZXNDb3VudCA9IHBhY2thZ2VzLmxlbmd0aDtcbiAgICAgICAgcGFja2FnZXMgPSBwYWNrYWdlcy5maWx0ZXIodmFsdWUgPT4gIXRoaXMuZGVwcmVjdGF0ZWRQbHVnaW5zLmluY2x1ZGVzKHZhbHVlKSk7XG4gICAgICAgIGlmIChwYWNrYWdlc0NvdW50ICE9PSBwYWNrYWdlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMubG9nLndhcm4oJ3lvdSBoYXZlIHNvbWUgZGVwcmVjYXRlZCBtZXRlb3IgZGVza3RvcCBwbHVnaW5zIGluIHlvdXIgc2V0dGluZ3MsIHBsZWFzZSByZW1vdmUgJyArXG4gICAgICAgICAgICAgICAgYHRoZW0gKGRlcHJlY2F0ZWQgcGx1Z2luczogJHt0aGlzLmRlcHJlY3RhdGVkUGx1Z2lucy5qb2luKCcsICcpfSlgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwYWNrYWdlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwbHVnaW5zID0gYCR7cGx1Z2lucy5zdWJzdHIoMCwgcGx1Z2lucy5sZW5ndGggLSAyKX1dYDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy4kLm1ldGVvckFwcC5tZXRlb3JNYW5hZ2VyLmVuc3VyZVBhY2thZ2VzKFxuICAgICAgICAgICAgICAgICAgICBwYWNrYWdlcywgcGFja2FnZXNXaXRoVmVyc2lvbiwgcGx1Z2luc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQnVpbGRzIG1ldGVvciBhcHAuXG4gICAgICovXG4gICAgYXN5bmMgZ2V0TWV0ZW9yQ2xpZW50QnVpbGQoKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuJC5tZXRlb3JBcHAuYnVpbGQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIG5vZGVfbW9kdWxlcyBpZiBuZWVkZWQuXG4gICAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59XG4gICAgICovXG4gICAgYXN5bmMgaGFuZGxlU3RhdGVPZk5vZGVNb2R1bGVzKCkge1xuICAgICAgICBpZiAodGhpcy4kLmVudi5pc1Byb2R1Y3Rpb25CdWlsZCgpIHx8IHRoaXMuJC5lbnYub3B0aW9ucy5pYTMyKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuJC5lbnYuaXNQcm9kdWN0aW9uQnVpbGQoKSkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9nLmluZm8oJ2NsZWFyaW5nIG5vZGVfbW9kdWxlcyBiZWNhdXNlIHdlIG5lZWQgdG8gaGF2ZSBpdCBjbGVhciBmb3IgaWEzMiByZWJ1aWxkJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMubG9nLmluZm8oJ2NsZWFyaW5nIG5vZGVfbW9kdWxlcyBiZWNhdXNlIHRoaXMgaXMgYSBwcm9kdWN0aW9uIGJ1aWxkJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuJC51dGlscy5ybVdpdGhSZXRyaWVzKFxuICAgICAgICAgICAgICAgICAgICAnLXJmJywgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5ub2RlTW9kdWxlc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRoZXJlIGlzIGEgdGVtcG9yYXJ5IG5vZGVfbW9kdWxlcyBmb2xkZXIgYW5kIG5vIG5vZGVfbW9kdWxlcyBmb2xkZXIsIHdlIHdpbGxcbiAgICAgKiByZXN0b3JlIGl0LCBhcyBpdCBtaWdodCBiZSBhIGxlZnRvdmVyIGZyb20gYW4gaW50ZXJydXB0ZWQgZmxvdy5cbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn1cbiAgICAgKi9cbiAgICBhc3luYyBoYW5kbGVUZW1wb3JhcnlOb2RlTW9kdWxlcygpIHtcbiAgICAgICAgaWYgKHRoaXMuJC51dGlscy5leGlzdHModGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC50bXBOb2RlTW9kdWxlcykpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy4kLnV0aWxzLmV4aXN0cyh0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLm5vZGVNb2R1bGVzKSkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9nLmRlYnVnKCdtb3ZpbmcgdGVtcCBub2RlX21vZHVsZXMgYmFjaycpO1xuICAgICAgICAgICAgICAgIHNoZWxsLm12KFxuICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLnRtcE5vZGVNb2R1bGVzLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLm5vZGVNb2R1bGVzXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBub2RlX21vZHVsZXMgZm9sZGVyLCB3ZSBzaG91bGQgY2xlYXIgdGhlIHRlbXBvcmFyeSBvbmUuXG4gICAgICAgICAgICAgICAgdGhpcy5sb2cuZGVidWcoJ2NsZWFyaW5nIHRlbXAgbm9kZV9tb2R1bGVzIGJlY2F1c2UgbmV3IG9uZSBpcyBhbHJlYWR5IGNyZWF0ZWQnKTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLiQudXRpbHMucm1XaXRoUmV0cmllcyhcbiAgICAgICAgICAgICAgICAgICAgICAgICctcmYnLCB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLnRtcE5vZGVNb2R1bGVzXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUnVucyBucG0gbGluayBmb3IgZXZlcnkgcGFja2FnZSBzcGVjaWZpZWQgaW4gc2V0dGluZ3MuanNvbi0+bGlua1BhY2thZ2VzLlxuICAgICAqL1xuICAgIGFzeW5jIGxpbmtOcG1QYWNrYWdlcygpIHtcbiAgICAgICAgaWYgKHRoaXMuJC5lbnYuaXNQcm9kdWN0aW9uQnVpbGQoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gdGhpcy4kLmRlc2t0b3AuZ2V0U2V0dGluZ3MoKTtcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICAgICAgaWYgKCdsaW5rUGFja2FnZXMnIGluIHRoaXMuJC5kZXNrdG9wLmdldFNldHRpbmdzKCkpIHtcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHNldHRpbmdzLmxpbmtQYWNrYWdlcykpIHtcbiAgICAgICAgICAgICAgICBzZXR0aW5ncy5saW5rUGFja2FnZXMuZm9yRWFjaChwYWNrYWdlTmFtZSA9PlxuICAgICAgICAgICAgICAgICAgICBwcm9taXNlcy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy4kLm1ldGVvckFwcC5ydW5OcG0oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgWydsaW5rJywgcGFja2FnZU5hbWVdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLnJvb3RcbiAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJ1bnMgbnBtIGluIHRoZSBlbGVjdHJvbiBhcHAgdG8gZ2V0IHRoZSBkZXBlbmRlbmNpZXMgaW5zdGFsbGVkLlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgICAqL1xuICAgIGFzeW5jIGVuc3VyZURlcHMoKSB7XG4gICAgICAgIHRoaXMubG9nLmluZm8oJ2luc3RhbGxpbmcgZGVwZW5kZW5jaWVzJyk7XG4gICAgICAgIGlmICh0aGlzLiQudXRpbHMuZXhpc3RzKHRoaXMuJC5lbnYucGF0aHMuZWxlY3Ryb25BcHAubm9kZU1vZHVsZXMpKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5kZWJ1ZygncnVubmluZyBucG0gcHJ1bmUgdG8gd2lwZSB1bm5lZWRlZCBkZXBlbmRlbmNpZXMnKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5ydW5OcG0oWydwcnVuZSddKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucnVuTnBtKFsnaW5zdGFsbCddLCB0aGlzLiQuZW52LnN0ZGlvKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogV2FybnMgaWYgcGx1Z2lucyB2ZXJzaW9uIGFyZSBvdXRkYXRlZCBpbiBjb21wYXJlIHRvIHRoZSBuZXdlc3Qgc2NhZmZvbGQuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBsdWdpbnNWZXJzaW9ucyAtIGN1cnJlbnQgcGx1Z2lucyB2ZXJzaW9ucyBmcm9tIHNldHRpbmdzLmpzb25cbiAgICAgKi9cbiAgICBjaGVja1BsdWdpbnNWZXJzaW9uKHBsdWdpbnNWZXJzaW9ucykge1xuICAgICAgICBjb25zdCBzZXR0aW5nc0pzb24gPSBKU09OLnBhcnNlKFxuICAgICAgICAgICAgZnMucmVhZEZpbGVTeW5jKHBhdGguam9pbih0aGlzLiQuZW52LnBhdGhzLnNjYWZmb2xkLCAnc2V0dGluZ3MuanNvbicpKVxuICAgICAgICApO1xuICAgICAgICBjb25zdCBzY2FmZm9sZFBsdWdpbnNWZXJzaW9uID0gdGhpcy4kLmRlc2t0b3AuZ2V0RGVwZW5kZW5jaWVzKHNldHRpbmdzSnNvbiwgZmFsc2UpLnBsdWdpbnM7XG4gICAgICAgIE9iamVjdC5rZXlzKHBsdWdpbnNWZXJzaW9ucykuZm9yRWFjaCgocGx1Z2luTmFtZSkgPT4ge1xuICAgICAgICAgICAgaWYgKHBsdWdpbk5hbWUgaW4gc2NhZmZvbGRQbHVnaW5zVmVyc2lvbiAmJlxuICAgICAgICAgICAgICAgIHNjYWZmb2xkUGx1Z2luc1ZlcnNpb25bcGx1Z2luTmFtZV0gIT09IHBsdWdpbnNWZXJzaW9uc1twbHVnaW5OYW1lXSAmJlxuICAgICAgICAgICAgICAgIHNlbXZlci5sdChwbHVnaW5zVmVyc2lvbnNbcGx1Z2luTmFtZV0sIHNjYWZmb2xkUGx1Z2luc1ZlcnNpb25bcGx1Z2luTmFtZV0pXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxvZy53YXJuKGB5b3UgYXJlIHVzaW5nIG91dGRhdGVkIHZlcnNpb24gJHtwbHVnaW5zVmVyc2lvbnNbcGx1Z2luTmFtZV19IG9mIGAgK1xuICAgICAgICAgICAgICAgICAgICBgJHtwbHVnaW5OYW1lfSwgdGhlIHN1Z2dlc3RlZCB2ZXJzaW9uIHRvIHVzZSBpcyBgICtcbiAgICAgICAgICAgICAgICAgICAgYCR7c2NhZmZvbGRQbHVnaW5zVmVyc2lvbltwbHVnaW5OYW1lXX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTWVyZ2VzIGNvcmUgZGVwZW5kZW5jeSBsaXN0IHdpdGggdGhlIGRlcGVuZGVuY2llcyBmcm9tIC5kZXNrdG9wLlxuICAgICAqL1xuICAgIHVwZGF0ZURlcGVuZGVuY2llc0xpc3QoKSB7XG4gICAgICAgIHRoaXMubG9nLmluZm8oJ3VwZGF0aW5nIGxpc3Qgb2YgcGFja2FnZS5qc29uXFwncyBkZXBlbmRlbmNpZXMnKTtcbiAgICAgICAgY29uc3QgZGVza3RvcERlcGVuZGVuY2llcyA9IHRoaXMuJC5kZXNrdG9wLmdldERlcGVuZGVuY2llcygpO1xuXG4gICAgICAgIHRoaXMuY2hlY2tQbHVnaW5zVmVyc2lvbihkZXNrdG9wRGVwZW5kZW5jaWVzLnBsdWdpbnMpO1xuXG4gICAgICAgIHRoaXMubG9nLmRlYnVnKCdtZXJnaW5nIHNldHRpbmdzLmpzb25bZGVwZW5kZW5jaWVzXScpO1xuICAgICAgICB0aGlzLmRlcHNNYW5hZ2VyLm1lcmdlRGVwZW5kZW5jaWVzKFxuICAgICAgICAgICAgJ3NldHRpbmdzLmpzb25bZGVwZW5kZW5jaWVzXScsXG4gICAgICAgICAgICBkZXNrdG9wRGVwZW5kZW5jaWVzLmZyb21TZXR0aW5nc1xuICAgICAgICApO1xuICAgICAgICB0aGlzLmxvZy5kZWJ1ZygnbWVyZ2luZyBzZXR0aW5ncy5qc29uW3BsdWdpbnNdJyk7XG4gICAgICAgIHRoaXMuZGVwc01hbmFnZXIubWVyZ2VEZXBlbmRlbmNpZXMoXG4gICAgICAgICAgICAnc2V0dGluZ3MuanNvbltwbHVnaW5zXScsXG4gICAgICAgICAgICBkZXNrdG9wRGVwZW5kZW5jaWVzLnBsdWdpbnNcbiAgICAgICAgKTtcblxuICAgICAgICB0aGlzLmxvZy5kZWJ1ZygnbWVyZ2luZyBkZXBlbmRlbmNpZXMgZnJvbSBtb2R1bGVzJyk7XG4gICAgICAgIE9iamVjdC5rZXlzKGRlc2t0b3BEZXBlbmRlbmNpZXMubW9kdWxlcykuZm9yRWFjaChtb2R1bGUgPT5cbiAgICAgICAgICAgIHRoaXMuZGVwc01hbmFnZXIubWVyZ2VEZXBlbmRlbmNpZXMoXG4gICAgICAgICAgICAgICAgYG1vZHVsZVske21vZHVsZX1dYCxcbiAgICAgICAgICAgICAgICBkZXNrdG9wRGVwZW5kZW5jaWVzLm1vZHVsZXNbbW9kdWxlXVxuICAgICAgICAgICAgKSk7XG5cbiAgICAgICAgdGhpcy5wYWNrYWdlSnNvbi5kZXBlbmRlbmNpZXMgPSB0aGlzLmRlcHNNYW5hZ2VyLmdldFJlbW90ZURlcGVuZGVuY2llcygpO1xuICAgICAgICB0aGlzLnBhY2thZ2VKc29uLmxvY2FsRGVwZW5kZW5jaWVzID0gdGhpcy5kZXBzTWFuYWdlci5nZXRMb2NhbERlcGVuZGVuY2llcygpO1xuXG4gICAgICAgIHRoaXMubG9nLmRlYnVnKCd3cml0aW5nIHVwZGF0ZWQgcGFja2FnZS5qc29uJyk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoXG4gICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLnBhY2thZ2VKc29uLCBKU09OLnN0cmluZ2lmeSh0aGlzLnBhY2thZ2VKc29uLCBudWxsLCAyKVxuICAgICAgICApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluc3RhbGwgbm9kZSBtb2R1bGVzIGZyb20gbG9jYWwgcGF0aHMgdXNpbmcgbG9jYWwtaW5zdGFsbC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBhcmNoXG4gICAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAgICovXG4gICAgaW5zdGFsbExvY2FsTm9kZU1vZHVsZXMoYXJjaCA9IHRoaXMuJC5lbnYub3B0aW9ucy5pYTMyIHx8IHByb2Nlc3MuYXJjaCA9PT0gJ2lhMzInID8gJ2lhMzInIDogJ3g2NCcpIHtcbiAgICAgICAgY29uc3QgbG9jYWxEZXBlbmRlbmNpZXMgPSBfLnZhbHVlcyh0aGlzLnBhY2thZ2VKc29uLmxvY2FsRGVwZW5kZW5jaWVzKTtcbiAgICAgICAgaWYgKGxvY2FsRGVwZW5kZW5jaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubG9nLmluZm8oJ2luc3RhbGxpbmcgbG9jYWwgbm9kZSBtb2R1bGVzJyk7XG4gICAgICAgIGNvbnN0IGxhc3RSZWJ1aWxkID0gdGhpcy4kLmVsZWN0cm9uQnVpbGRlci5wcmVwYXJlTGFzdFJlYnVpbGRPYmplY3QoYXJjaCk7XG4gICAgICAgIGNvbnN0IGVudiA9IHRoaXMuJC5lbGVjdHJvbkJ1aWxkZXIuZ2V0R3lwRW52KGxhc3RSZWJ1aWxkLmZyYW1ld29ya0luZm8sIGxhc3RSZWJ1aWxkLnBsYXRmb3JtLCBsYXN0UmVidWlsZC5hcmNoKTtcbiAgICAgICAgY29uc3QgaW5zdGFsbGVyID0gbmV3IExvY2FsSW5zdGFsbGVyKFxuICAgICAgICAgICAgeyBbdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5yb290XTogbG9jYWxEZXBlbmRlbmNpZXMgfSxcbiAgICAgICAgICAgIHsgbnBtRW52OiBlbnYgfVxuICAgICAgICApO1xuICAgICAgICBwcm9ncmVzcyhpbnN0YWxsZXIpO1xuICAgICAgICByZXR1cm4gaW5zdGFsbGVyLmluc3RhbGwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZWJ1aWxkIGJpbmFyeSBkZXBlbmRlbmNpZXMgYWdhaW5zdCBFbGVjdHJvbidzIG5vZGUgaGVhZGVycy5cbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICAgKi9cbiAgICByZWJ1aWxkRGVwcyhpbnN0YWxsID0gZmFsc2UpIHtcbiAgICAgICAgaWYgKGluc3RhbGwpIHtcbiAgICAgICAgICAgIHRoaXMubG9nLmluZm8oJ2lzc3Vpbmcgbm9kZV9tb2R1bGVzIGluc3RhbGwgZnJvbSBlbGVjdHJvbi1idWlsZGVyJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmxvZy5pbmZvKCdpc3N1aW5nIG5hdGl2ZSBtb2R1bGVzIHJlYnVpbGQgZnJvbSBlbGVjdHJvbi1idWlsZGVyJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBhcmNoID0gdGhpcy4kLmVudi5vcHRpb25zLmlhMzIgfHwgcHJvY2Vzcy5hcmNoID09PSAnaWEzMicgPyAnaWEzMicgOiAneDY0JztcblxuICAgICAgICBpZiAodGhpcy4kLmVudi5vcHRpb25zLmlhMzIpIHtcbiAgICAgICAgICAgIHRoaXMubG9nLnZlcmJvc2UoJ2ZvcmNpbmcgcmVidWlsZCBmb3IgMzJiaXQnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubG9nLnZlcmJvc2UoYHJlYnVpbGRpbmcgZm9yICR7YXJjaH1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLiQuZWxlY3Ryb25CdWlsZGVyLmluc3RhbGxPclJlYnVpbGQoYXJjaCwgdW5kZWZpbmVkLCBpbnN0YWxsKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGUgcGFja2FnZS5qc29uIGZpZWxkcyBhY2NvcmRpbmdseSB0byB3aGF0IGlzIHNldCBpbiBzZXR0aW5ncy5qc29uLlxuICAgICAqXG4gICAgICogcGFja2FnZUpzb24ubmFtZSA9IHNldHRpbmdzLnByb2plY3ROYW1lXG4gICAgICogcGFja2FnZUpzb24udmVyc2lvbiA9IHNldHRpbmdzLnZlcnNpb25cbiAgICAgKiBwYWNrYWdlSnNvbi4qID0gc2V0dGluZ3MucGFja2FnZUpzb25GaWVsZHNcbiAgICAgKi9cbiAgICB1cGRhdGVQYWNrYWdlSnNvbkZpZWxkcygpIHtcbiAgICAgICAgdGhpcy5sb2cudmVyYm9zZSgndXBkYXRpbmcgcGFja2FnZS5qc29uIGZpZWxkcycpO1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMuJC5kZXNrdG9wLmdldFNldHRpbmdzKCk7XG4gICAgICAgIC8qKiBAdHlwZSB7ZGVza3RvcFNldHRpbmdzfSAqL1xuICAgICAgICBjb25zdCBwYWNrYWdlSnNvbiA9IHRoaXMuc2NhZmZvbGQuZ2V0RGVmYXVsdFBhY2thZ2VKc29uKCk7XG5cbiAgICAgICAgcGFja2FnZUpzb24udmVyc2lvbiA9IHNldHRpbmdzLnZlcnNpb247XG4gICAgICAgIGlmICgncGFja2FnZUpzb25GaWVsZHMnIGluIHNldHRpbmdzKSB7XG4gICAgICAgICAgICBhc3NpZ25JbihwYWNrYWdlSnNvbiwgc2V0dGluZ3MucGFja2FnZUpzb25GaWVsZHMpO1xuICAgICAgICB9XG4gICAgICAgIGFzc2lnbkluKHBhY2thZ2VKc29uLCB7IG5hbWU6IHNldHRpbmdzLnByb2plY3ROYW1lIH0pO1xuXG4gICAgICAgIHRoaXMubG9nLmRlYnVnKCd3cml0aW5nIHVwZGF0ZWQgcGFja2FnZS5qc29uJyk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoXG4gICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLnBhY2thZ2VKc29uLCBKU09OLnN0cmluZ2lmeShwYWNrYWdlSnNvbiwgbnVsbCwgNClcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5wYWNrYWdlSnNvbiA9IHBhY2thZ2VKc29uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgc2V0dGluZ3MuanNvbiB3aXRoIGVudiAocHJvZC9kZXYpIGluZm9ybWF0aW9uIGFuZCB2ZXJzaW9ucy5cbiAgICAgKi9cbiAgICBhc3luYyB1cGRhdGVTZXR0aW5nc0pzb25GaWVsZHMoKSB7XG4gICAgICAgIHRoaXMubG9nLmRlYnVnKCd1cGRhdGluZyBzZXR0aW5ncy5qc29uIGZpZWxkcycpO1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMuJC5kZXNrdG9wLmdldFNldHRpbmdzKCk7XG5cbiAgICAgICAgLy8gU2F2ZSB2ZXJzaW9ucy5cbiAgICAgICAgc2V0dGluZ3MuY29tcGF0aWJpbGl0eVZlcnNpb24gPSB0aGlzLmNvbXBhdGliaWxpdHlWZXJzaW9uO1xuXG4gICAgICAgIC8vIFBhc3MgaW5mb3JtYXRpb24gYWJvdXQgYnVpbGQgdHlwZSB0byB0aGUgc2V0dGluZ3MuanNvbi5cbiAgICAgICAgc2V0dGluZ3MuZW52ID0gKHRoaXMuJC5lbnYuaXNQcm9kdWN0aW9uQnVpbGQoKSkgP1xuICAgICAgICAgICAgJ3Byb2QnIDogJ2Rldic7XG5cbiAgICAgICAgY29uc3QgdmVyc2lvbiA9IGF3YWl0IHRoaXMuJC5kZXNrdG9wLmdldEhhc2hWZXJzaW9uKCk7XG4gICAgICAgIHNldHRpbmdzLmRlc2t0b3BWZXJzaW9uID0gYCR7dmVyc2lvbn1fJHtzZXR0aW5ncy5lbnZ9YDtcblxuICAgICAgICBzZXR0aW5ncy5tZXRlb3JEZXNrdG9wVmVyc2lvbiA9IHRoaXMuJC5nZXRWZXJzaW9uKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuJC5lbnYub3B0aW9ucy5wcm9kRGVidWcpIHtcbiAgICAgICAgICAgIHNldHRpbmdzLnByb2REZWJ1ZyA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKFxuICAgICAgICAgICAgdGhpcy4kLmVudi5wYXRocy5kZXNrdG9wVG1wLnNldHRpbmdzLCBKU09OLnN0cmluZ2lmeShzZXR0aW5ncywgbnVsbCwgNClcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgZmlsZXMgZnJvbSBwcmVwYXJlZCAuZGVza3RvcCB0byBkZXNrdG9wLmFzYXIgaW4gZWxlY3Ryb24gYXBwLlxuICAgICAqL1xuICAgIHBhY2tEZXNrdG9wVG9Bc2FyKCkge1xuICAgICAgICB0aGlzLmxvZy5pbmZvKCdwYWNraW5nIC5kZXNrdG9wIHRvIGFzYXInKTtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGFzYXIuY3JlYXRlUGFja2FnZShcbiAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmRlc2t0b3BUbXAucm9vdCxcbiAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLmRlc2t0b3BBc2FyXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvZy52ZXJib3NlKCdjbGVhcmluZyB0ZW1wb3JhcnkgLmRlc2t0b3AnKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kLnV0aWxzXG4gICAgICAgICAgICAgICAgICAgICAgICAucm1XaXRoUmV0cmllcygnLXJmJywgdGhpcy4kLmVudi5wYXRocy5kZXNrdG9wVG1wLnJvb3QpXG4gICAgICAgICAgICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaCgoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1ha2VzIGEgdGVtcG9yYXJ5IGNvcHkgb2YgLmRlc2t0b3AuXG4gICAgICovXG4gICAgY29weURlc2t0b3BUb0Rlc2t0b3BUZW1wKCkge1xuICAgICAgICB0aGlzLmxvZy52ZXJib3NlKCdjb3B5aW5nIC5kZXNrdG9wIHRvIHRlbXBvcmFyeSBsb2NhdGlvbicpO1xuICAgICAgICBzaGVsbC5jcCgnLXJmJywgdGhpcy4kLmVudi5wYXRocy5kZXNrdG9wLnJvb3QsIHRoaXMuJC5lbnYucGF0aHMuZGVza3RvcFRtcC5yb290KTtcbiAgICAgICAgLy8gUmVtb3ZlIHRlc3QgZmlsZXMuXG4gICAgICAgIGRlbC5zeW5jKFtcbiAgICAgICAgICAgIHBhdGguam9pbih0aGlzLiQuZW52LnBhdGhzLmRlc2t0b3BUbXAucm9vdCwgJyoqJywgJyoudGVzdC5qcycpXG4gICAgICAgIF0sIHsgZm9yY2U6IHRydWUgfSk7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBSdW5zIGJhYmVsIGFuZCB1Z2xpZnkgb3ZlciAuZGVza3RvcCBpZiByZXF1ZXN0ZWQuXG4gICAgICovXG4gICAgYXN5bmMgdHJhbnNwaWxlQW5kTWluaWZ5KCkge1xuICAgICAgICB0aGlzLmxvZy5pbmZvKCd0cmFuc3BpbGluZyBhbmQgdWdsaWZ5aW5nJyk7XG5cbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLiQuZGVza3RvcC5nZXRTZXR0aW5ncygpO1xuICAgICAgICBjb25zdCBvcHRpb25zID0gJ3VnbGlmeU9wdGlvbnMnIGluIHNldHRpbmdzID8gc2V0dGluZ3MudWdsaWZ5T3B0aW9ucyA6IHt9O1xuXG4gICAgICAgIGNvbnN0IHVnbGlmeWluZ0VuYWJsZWQgPSAndWdsaWZ5JyBpbiBzZXR0aW5ncyAmJiAhIXNldHRpbmdzLnVnbGlmeTtcblxuICAgICAgICBjb25zdCBwcmVzZXQgPSBwcmVzZXRFbnYoeyBhc3NlcnRWZXJzaW9uOiAoKSA9PiB7IH0gfSwgeyB0YXJnZXRzOiB7IG5vZGU6ICcxMicgfSB9KTtcblxuICAgICAgICBjb25zdCB7IGRhdGE6IGZpbGVzIH0gPSBhd2FpdCB0aGlzLiQudXRpbHMucmVhZERpcih0aGlzLiQuZW52LnBhdGhzLmRlc2t0b3BUbXAucm9vdCk7XG5cbiAgICAgICAgZmlsZXMuZm9yRWFjaCgoZmlsZSkgPT4ge1xuICAgICAgICAgICAgaWYgKGZpbGUuZW5kc1dpdGgoJy5qcycpKSB7XG4gICAgICAgICAgICAgICAgbGV0IHsgY29kZSB9ID0gdHJhbnNmb3JtRmlsZVN5bmMoZmlsZSwge1xuICAgICAgICAgICAgICAgICAgICBwcmVzZXRzOiBbcHJlc2V0XVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGxldCBlcnJvcjtcbiAgICAgICAgICAgICAgICBpZiAoc2V0dGluZ3MuZW52ID09PSAncHJvZCcgJiYgdWdsaWZ5aW5nRW5hYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICAoeyBjb2RlLCBlcnJvciB9ID0gdWdsaWZ5Lm1pbmlmeShjb2RlLCBvcHRpb25zKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGUsIGNvZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyBhbGwgdGhlIGZpbGVzIHRoYXQgc2hvdWxkIG5vdCBiZSBwYWNrZWQgaW50byBhc2FyIGludG8gYSBzYWZlIGxvY2F0aW9uIHdoaWNoIGlzIHRoZVxuICAgICAqICdleHRyYWN0ZWQnIGRpciBpbiB0aGUgZWxlY3Ryb24gYXBwLlxuICAgICAqL1xuICAgIGFzeW5jIGV4Y2x1ZGVGaWxlc0Zyb21BcmNoaXZlKCkge1xuICAgICAgICB0aGlzLmxvZy5pbmZvKCdleGNsdWRpbmcgZmlsZXMgZnJvbSBwYWNraW5nJyk7XG5cbiAgICAgICAgLy8gRW5zdXJlIGVtcHR5IGBleHRyYWN0ZWRgIGRpclxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLiQudXRpbHMucm1XaXRoUmV0cmllcygnLXJmJywgdGhpcy4kLmVudi5wYXRocy5lbGVjdHJvbkFwcC5leHRyYWN0ZWQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZSk7XG4gICAgICAgIH1cblxuICAgICAgICBzaGVsbC5ta2Rpcih0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLmV4dHJhY3RlZCk7XG5cbiAgICAgICAgY29uc3QgY29uZmlncyA9IHRoaXMuJC5kZXNrdG9wLmdhdGhlck1vZHVsZUNvbmZpZ3MoKTtcblxuICAgICAgICAvLyBNb3ZlIGZpbGVzIHRoYXQgc2hvdWxkIG5vdCBiZSBhc2FyJ2VkLlxuICAgICAgICBjb25maWdzLmZvckVhY2goKGNvbmZpZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgbW9kdWxlQ29uZmlnID0gY29uZmlnO1xuICAgICAgICAgICAgaWYgKCdleHRyYWN0JyBpbiBtb2R1bGVDb25maWcpIHtcbiAgICAgICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkobW9kdWxlQ29uZmlnLmV4dHJhY3QpKSB7XG4gICAgICAgICAgICAgICAgICAgIG1vZHVsZUNvbmZpZy5leHRyYWN0ID0gW21vZHVsZUNvbmZpZy5leHRyYWN0XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbW9kdWxlQ29uZmlnLmV4dHJhY3QuZm9yRWFjaCgoZmlsZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvZy5kZWJ1ZyhgZXhjbHVkaW5nICR7ZmlsZX0gZnJvbSAke2NvbmZpZy5uYW1lfWApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHBhdGguam9pbihcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuJC5lbnYucGF0aHMuZGVza3RvcFRtcC5tb2R1bGVzLCBtb2R1bGVDb25maWcuZGlyTmFtZSwgZmlsZVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkZXN0aW5hdGlvblBhdGggPSBwYXRoLmpvaW4oXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLiQuZW52LnBhdGhzLmVsZWN0cm9uQXBwLmV4dHJhY3RlZCwgbW9kdWxlQ29uZmlnLmRpck5hbWVcbiAgICAgICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMuJC51dGlscy5leGlzdHMoZGVzdGluYXRpb25QYXRoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2hlbGwubWtkaXIoZGVzdGluYXRpb25QYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzaGVsbC5tdihmaWxlUGF0aCwgZGVzdGluYXRpb25QYXRoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7QUFuQkE7QUFxQkFBLGdCQUFBLENBQU1DLE1BQU4sQ0FBYUMsS0FBYixHQUFxQixJQUFyQjtBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUNlLE1BQU1DLFdBQU4sQ0FBa0I7RUFDN0I7QUFDSjtBQUNBO0FBQ0E7RUFDSUMsV0FBVyxDQUFDQyxDQUFELEVBQUk7SUFDWCxLQUFLQyxHQUFMLEdBQVcsSUFBSUMsWUFBSixDQUFRLGFBQVIsQ0FBWDtJQUNB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