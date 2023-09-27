/* eslint-disable no-console, no-param-reassign */
const { fs, path } = Plugin;
const versionFilePath = './version.desktop';
const Future = Npm.require('fibers/future');
const chokidar = Npm.require('chokidar');

function arraysIdentical(a, b) {
    let i = a.length;
    if (i !== b.length) return false;
    while (i) {
        i -= 1;
        if (a[i] !== b[i]) return false;
    }
    return true;
}

// TODO: purge cache every now and then

fs.existsSync = (function existsSync(pathToCheck) {
    try {
        return !!this.statSync(pathToCheck);
    } catch (e) {
        return null;
    }
}).bind(fs);

function addToGitIgnore() {
    let gitIgnore;
    try {
        gitIgnore = fs.readFileSync('./.gitignore', 'utf8');
        if (!~gitIgnore.indexOf('version.desktop')) {
            gitIgnore += '\nversion.desktop\n';
            fs.writeFileSync('./.gitignore', gitIgnore);
        }
    } catch (e) {
        console.warn('[meteor-desktop] could not add version.desktop to .gitignore, please do' +
            ' it manually');
    }
}

if (!fs.existsSync(versionFilePath)) {
    fs.writeFileSync(versionFilePath, JSON.stringify({
        version: 'initial',
    }, null, 2), 'UTF-8');
    addToGitIgnore();
}


function toCamelCase(name) {
    return name
        .replace(/[-/](.)/g, $1 => $1.toUpperCase())
        .replace(/[-@/]/g, '');
}

/*
 * Important! This is a POC.
 *
 * A lot of stuff is basically duplicated here with the main npm package. This is because I had real
 * trouble with just requiring `meteor-desktop`. Because the stack trace that comes from a build
 * plugin was not really specific what was the problem I decided to implement the minimum needed
 * here with just copying the code. This needs to be investigated and fixed.
 */

class MeteorDesktopBundler {
    constructor(fileSystem) {
        this.fs = fileSystem;
        this.deps = [
            'cacache'
        ];
        this.buildDeps = [
            '@electron/asar',
            'shelljs',
            'del',
            '@babel/core',
            '@babel/preset-env',
            'terser',
            'md5',
            'cacache'
        ];

        this.version = null;
        this.packageJson = null;
        this.requireLocal = null;
        this.cachePath = './.meteor/local/desktop-cache';
        this.desktopPath = './.desktop';
        this.watcher = chokidar.watch(this.desktopPath, {
            persistent: true,
            ignored: /tmp___/,
            ignoreInitial: true
        });
        this.utils = null;

        this.watcherEnabled = false;

        this.timeout = null;

        this.watcher
            .on('all', (event, filePath) => {
                if (this.timeout) {
                    clearTimeout(this.timeout);
                }
                // Simple 2s debounce.
                this.timeout = setTimeout(() => {
                    if (this.watcherEnabled && this.utils) {
                        console.log(`[meteor-desktop] ${filePath} have been changed, triggering` +
                            ' desktop rebuild.');

                        this.utils.readFilesAndComputeHash(this.desktopPath, file => file.replace('.desktop', ''))
                            .then((result) => {
                                const { hash } = result;
                                fs.writeFileSync(versionFilePath, JSON.stringify({
                                    version: `${hash}_dev`,
                                }, null, 2), 'UTF-8');
                            })
                            .catch((e) => { throw new Error(`[meteor-desktop] failed to compute .desktop hash: ${e}`); });
                    }
                }, 2000);
            });
    }

    /**
     * Tries to read a settings.json file from desktop dir.
     *
     * @param {Object} file        - The file being processed by the build plugin.
     * @param {string} desktopPath - Path to the desktop dir.
     * @returns {Object}
     */
    getSettings(desktopPath, file) {
        let settings = {};
        try {
            settings = JSON.parse(
                this.fs.readFileSync(path.join(desktopPath, 'settings.json'), 'UTF-8')
            );
        } catch (e) {
            file.error({
                message: `error while trying to read 'settings.json' from '${desktopPath}' module`
            });
        }
        return settings;
    }

    /**
     * Tries to read a module.json file from module at provided path.
     *
     * @param {string} modulePath - Path to the module dir.
     * @param {Object} file       - The file being processed by the build plugin.
     * @returns {Object}
     */
    getModuleConfig(modulePath, file) {
        let moduleConfig = {};
        try {
            moduleConfig = JSON.parse(
                this.fs.readFileSync(path.join(modulePath, 'module.json'), 'UTF-8')
            );
        } catch (e) {
            file.error({
                message: `error while trying to read 'module.json' from '${modulePath}' module`
            });
        }
        return moduleConfig;
    }

    /**
     * Checks if the path is empty.
     * @param {string} searchPath
     * @returns {boolean}
     */
    isEmpty(searchPath) {
        let stat;
        try {
            stat = this.fs.statSync(searchPath);
        } catch (e) {
            return true;
        }
        if (stat.isDirectory()) {
            const items = this.fs.readdirSync(searchPath);
            return !items || !items.length;
        }
        return false;
    }

    /**
     * Scans all modules for module.json and gathers this configuration altogether.
     *
     * @returns {[]}
     */
    gatherModuleConfigs(shell, modulesPath, file) {
        const configs = [];

        if (!this.isEmpty(modulesPath)) {
            this.fs.readdirSync(modulesPath).forEach(
                (module) => {
                    if (this.fs.lstatSync(path.join(modulesPath, module)).isDirectory()) {
                        const moduleConfig =
                            this.getModuleConfig(path.join(modulesPath, module), file);
                        if (path.parse) {
                            moduleConfig.dirName = path.parse(module).name;
                        } else {
                            moduleConfig.dirName = path.basename(module);
                        }
                        configs.push(moduleConfig);
                    }
                }
            );
        }
        return configs;
    }

    /**
     * Merges core dependency list with the list made from .desktop.
     */
    getDependencies(desktopPath, file, configs, depsManager) {
        const settings = this.getSettings(desktopPath, file);
        const dependencies = {
            fromSettings: {},
            plugins: {},
            modules: {}
        };

        if ('dependencies' in settings) {
            dependencies.fromSettings = settings.dependencies;
        }

        // Plugins are also a npm packages.
        if ('plugins' in settings) {
            dependencies.plugins = Object.keys(settings.plugins).reduce((plugins, plugin) => {
                if (typeof settings.plugins[plugin] === 'object') {
                    plugins[plugin] = settings.plugins[plugin].version;
                } else {
                    plugins[plugin] = settings.plugins[plugin];
                }
                return plugins;
            }, {});
        }

        // Each module can have its own dependencies defined.
        const moduleDependencies = {};

        configs.forEach(
            (moduleConfig) => {
                if (!('dependencies' in moduleConfig)) {
                    moduleConfig.dependencies = {};
                }
                if (moduleConfig.name in moduleDependencies) {
                    file.error({
                        message: `duplicate name '${moduleConfig.name}' in 'module.json' in ` +
                            `'${moduleConfig.dirName}' - another module already registered the ` +
                            'same name.'
                    });
                }
                moduleDependencies[moduleConfig.name] = moduleConfig.dependencies;
            }
        );

        dependencies.modules = moduleDependencies;

        try {
            depsManager.mergeDependencies(
                'settings.json[dependencies]',
                dependencies.fromSettings
            );
            depsManager.mergeDependencies(
                'settings.json[plugins]',
                dependencies.plugins
            );

            Object.keys(dependencies.modules).forEach(module =>
                depsManager.mergeDependencies(
                    `module[${module}]`,
                    dependencies.modules[module]
                ));

            return depsManager;
        } catch (e) {
            file.error({ message: e.message });
            return {};
        }
    }

    /**
     * Calculates a md5 from all dependencies.
     */
    calculateCompatibilityVersion(dependencies, desktopPath, file, md5) {
        const settings = this.getSettings(desktopPath, file);

        if (('desktopHCPCompatibilityVersion' in settings)) {
            console.log(`[meteor-desktop] compatibility version overridden to ${settings.desktopHCPCompatibilityVersion}`);
            return `${settings.desktopHCPCompatibilityVersion}`;
        }

        let deps = Object.keys(dependencies).sort();
        deps = deps.map(dependency =>
            `${dependency}:${dependencies[dependency]}`);
        const mainCompatibilityVersion = this.requireLocal('@meteor-community/meteor-desktop/package.json')
            .version
            .split('.');
        const desktopCompatibilityVersion = settings.version.split('.')[0];
        deps.push(`meteor-desktop:${mainCompatibilityVersion[0]}`);
        deps.push(`desktop-app:${desktopCompatibilityVersion}`);
        if (process.env.METEOR_DESKTOP_DEBUG_DESKTOP_COMPATIBILITY_VERSION ||
            process.env.METEOR_DESKTOP_DEBUG
        ) {
            console.log('[meteor-desktop] compatibility version calculated from', deps);
        }
        return md5(JSON.stringify(deps));
    }

    /**
     * Tries to require a dependency from either apps node_module or meteor-desktop/node_modules.
     * Also verifies if the version is correct.
     *
     * @param {string} dependency
     * @param {string} version
     * @returns {null|Object}
     */
    getDependency(dependency, version) {
        let appScope = null;
        let meteorDesktopScope = null;

        try {
            // Try to require the dependency from apps node_modules.
            const requiredDependency = this.requireLocal(dependency);
            // If that succeeded lets load the version information.
            appScope = { dependency: requiredDependency, version: this.requireLocal(`${dependency}/package.json`).version };
            if (process.env.METEOR_DESKTOP_DEBUG) {
                console.log(`found ${dependency}@${appScope.version} [required: ${version}]`);
            }
        } catch (e) {
            // No harm at this moment...
        }

        try {
            // Look for the dependency in meteor-desktop/node_modules.
            // No need to check the version, npm ensures that.
            meteorDesktopScope = this.requireLocal(`@meteor-community/meteor-desktop/node_modules/${dependency}`);
            if (process.env.METEOR_DESKTOP_DEBUG) {
                console.log(`found ${dependency} in meteor-desktop scope`);
            }
        } catch (e) {
            // Also no harm...
        }

        if (appScope !== null && appScope.version === version) {
            return appScope.dependency;
        }
        if (meteorDesktopScope !== null) {
            return meteorDesktopScope;
        }

        return null;
    }

    /**
     * Returns package.json field from meteor-desktop package.
     * @param {string} field - field name
     */
    getPackageJsonField(field) {
        if (!this.packageJson) {
            try {
                this.packageJson = this.requireLocal('@meteor-community/meteor-desktop/package.json');
            } catch (e) {
                throw new Error('could not load package.json from meteor-desktop, is meteor-desktop' +
                    ' installed?');
            }
        }
        return this.packageJson[field];
    }

    /**
     * Returns meteor-desktop version.
     */
    getVersion() {
        return this.getPackageJsonField('version');
    }

    /**
     * Tries to find and require all node_modules dependencies.
     * @returns {{}}
     */
    lookForAndRequireDependencies(deps) {
        const dependencies = {};

        // Try to load the dependencies section from meteor-desktop so we will know what are
        // the correct versions.
        const versions = this.getPackageJsonField('dependencies');

        deps.forEach((dependency) => {
            const dependencyCamelCased = toCamelCase(dependency);

            this.stampPerformance(`deps get ${dependency}`);
            // Lets try to find that dependency.
            dependencies[dependencyCamelCased] =
                this.getDependency(dependency, versions[dependency]);
            this.stampPerformance(`deps get ${dependency}`);

            if (dependencies[dependencyCamelCased] === null) {
                throw new Error(
                    `error while trying to require ${dependency}, are you sure you have ` +
                    'meteor-desktop installed?'
                );
            }
        });

        return dependencies;
    }

    /**
     * Makes a performance stamp.
     * @param {string} id
     */
    stampPerformance(id) {
        if (id in this.performanceStamps) {
            this.performanceStamps[id] = Date.now() - this.performanceStamps[id].now;
        } else {
            this.performanceStamps[id] = { now: Date.now() };
        }
    }

    /**
     * Prints out a performance report.
     */
    getPerformanceReport() {
        console.log('[meteor-desktop] performance summary:');
        Object.keys(this.performanceStamps).forEach((stampName) => {
            if (typeof this.performanceStamps[stampName] === 'number') {
                console.log(`\t\t${stampName}: ${this.performanceStamps[stampName]}ms`);
            }
        });
    }

    /**
     * Checks if the stats objects are identical.
     * @param {Object} stat1
     * @param {Object} stat2
     * @returns {boolean}
     */
    static areStatsEqual(stat1, stat2) {
        let keys1 = Object.keys(stat1);
        let keys2 = Object.keys(stat2);
        if (keys1.length !== keys2.length) return false;
        keys1 = keys1.sort();
        keys2 = keys2.sort();
        if (!arraysIdentical(keys1, keys2)) return false;
        return keys1.every(
            key =>
                stat1[key].size === stat2[key].size &&
                stat1[key].dates[0] === stat2[key].dates[0] &&
                stat1[key].dates[1] === stat2[key].dates[1] &&
                stat1[key].dates[2] === stat2[key].dates[2]
        );
    }

    /**
     * Compiles the protocols.index.js file.
     *
     * @param {Array} files - Array with files to process.
     */
    processFilesForTarget(files) {
        this.performanceStamps = {};
        let inputFile = null;
        let versionFile = null;
        let requireLocal = null;

        // We need to find the files we are interested in.
        // version._desktop_.js -> METEOR_DESKTOP_VERSION is put there
        // version.desktop -> this file is in the root dir of the project so we can use it's
        //                    `require` to load things from app's node_modules
        files.forEach((file) => {
            if (file.getArch() === 'web.cordova') {
                if (file.getPackageName() === 'communitypackages:meteor-desktop-bundler' &&
                    file.getPathInPackage() === 'version._desktop_.js'
                ) {
                    versionFile = file;
                }
                if (file.getPackageName() === null && file.getPathInPackage() === 'version.desktop') {
                    requireLocal = file.require.bind(file);
                    inputFile = file;
                }
            } else if (file.getArch() !== 'web.browser' && this.version &&
                file.getPathInPackage() === 'version._desktop_.js'
            ) {
                file.addJavaScript({
                    sourcePath: file.getPathInPackage(),
                    path: file.getPathInPackage(),
                    data: `METEOR_DESKTOP_VERSION = ${JSON.stringify(this.version)};`,
                    hash: file.getSourceHash(),
                    sourceMap: null
                });
                this.version = null;
            }
        });

        if (inputFile === null || requireLocal === null || versionFile === null) {
            return;
        }

        this.requireLocal = requireLocal;

        Profile.time('meteor-desktop: preparing desktop.asar', () => {
            this.watcherEnabled = false;
            this.stampPerformance('whole build');
            const desktopPath = './.desktop';
            const settings = this.getSettings(desktopPath, inputFile);
            if (!settings.desktopHCP) {
                console.warn('[meteor-desktop] not preparing desktop.asar because desktopHCP ' +
                    'is set to false. Remove this plugin if you do not want to use desktopHCP.');
                return;
            }

            console.time('[meteor-desktop] preparing desktop.asar took');

            let electronAsar;
            let shelljs;
            let babelCore;
            let babelPresetEnv;
            let terser;
            let del;
            let cacache;
            let md5;

            /**
             * https://github.com/wojtkowiak/meteor-desktop/issues/33
             *
             * Below we are saving to a safe place a String.to prototype to restore it later.
             *
             * Without this this plugin would break building for Android - causing either the
             * built app to be broken or a 'No Java files found that extend CordovaActivity' error
             * to be displayed during build.
             *
             * Here is an attempt to describe the bug's mechanism...
             *
             * Cordova at each build tries to update file that extends CordovaActivity (even if
             * it is not necessary). To locate that file it just greps through source files
             * trying to locate that file:
             * https://github.com/apache/cordova-android/blob/6.1.x/bin/templates/cordova/lib/prepare.js#L196
             * usually it finds it in the default file which is 'MainActivity.java'.
             *
             * Later, a `sed` is applied to that file:
             * https://github.com/apache/cordova-android/blob/6.1.x/bin/templates/cordova/lib/prepare.js#L207
             *
             * Unfortunately this line fails and cleans the file contents, leaving it blank.
             * Therefore the built app is broken and on the next build the error appears because
             * the file was left empty and there are no files that extend the 'CordovaActivity` now.
             *
             * Now the fun part. Why does shelljs's sed cleans the file? Look:
             * `shell.sed(/package [\w\.]*;/, 'package ' + pkg + ';', java_files[0]).to(destFile);`
             * the part with `.to(destFile)` writes the output - and in this case writes an
             * empty file. It happens because cordova is using shelljs at version 0.5.x while
             * this plugin uses 0.7.x. At first it seemed like cordova-android would use the
             * package from wrong node_modules but that scenario was verified not to be true.
             *
             * Instead take a look how version 0.5.3 loads `.to` method:
             * https://github.com/shelljs/shelljs/blob/v0.5.3/shell.js#L58
             * It adds it to a String's prototype. `sed` returns a `ShellString` which returns
             * plain string, which has `to` method from the prototype. Well, messing with builtin
             * objects prototypes is an anti-pattern for a reason...
             *
             * Even though 0.7.5 does not add `to` to String's prototype anymore:
             * https://github.com/shelljs/shelljs/blob/v0.7.5/shell.js#L72
             * after first use of any command it somehow magically replaces that
             * String.prototype.to to its own. I am using the term 'magically' because from reading
             * the code I could not actually understand how does that happen.
             * Finally, because `to` implementation differs between those versions, when cordova
             * uses it by accident it does not receive the results of `sed` writing an empty file
             * as a result.
             */
            const StringPrototypeToOriginal = String.prototype.to;

            this.stampPerformance('basic deps lookout');
            let DependenciesManager;
            let ElectronAppScaffold;
            try {
                const deps = this.lookForAndRequireDependencies(this.deps);
                ({
                    cacache
                } = deps);

                DependenciesManager = requireLocal('@meteor-community/meteor-desktop/dist/dependenciesManager').default;
                this.utils = requireLocal('@meteor-community/meteor-desktop/dist/utils');
                ElectronAppScaffold =
                    requireLocal('@meteor-community/meteor-desktop/dist/electronAppScaffold').default;
            } catch (e) {
                // Look at the declaration of StringPrototypeToOriginal for explanation.
                String.prototype.to = StringPrototypeToOriginal; // eslint-disable-line

                inputFile.error({
                    message: e
                });
                return;
            }
            this.stampPerformance('basic deps lookout');

            const context = {
                env: {
                    isProductionBuild: () => process.env.NODE_ENV === 'production',
                    options: {
                        production: process.env.NODE_ENV === 'production'
                    }
                }
            };
            if (context.env.isProductionBuild()) {
                console.log('[meteor-desktop] creating a production build');
            }

            let shelljsConfig;
            const self = this;

            function logDebug(...args) {
                if (process.env.METEOR_DESKTOP_DEBUG) console.log(...args);
            }

            function addFiles(contents, desktopSettings) {
                const versionObject = {
                    version: desktopSettings.desktopVersion,
                    compatibilityVersion: desktopSettings.compatibilityVersion
                };
                self.stampPerformance('file add');
                inputFile.addAsset({
                    path: 'version.desktop.json',
                    data: JSON.stringify(versionObject, null, 2)
                });

                inputFile.addAsset({
                    path: 'desktop.asar',
                    data: contents
                });

                versionFile.addJavaScript({
                    sourcePath: inputFile.getPathInPackage(),
                    path: inputFile.getPathInPackage(),
                    data: `METEOR_DESKTOP_VERSION = ${JSON.stringify(versionObject)};`,
                    hash: inputFile.getSourceHash(),
                    sourceMap: null
                });
                self.stampPerformance('file add');
                self.version = versionObject;
                return versionObject;
            }

            function endProcess() {
                console.timeEnd('[meteor-desktop] preparing desktop.asar took');

                // Look at the declaration of StringPrototypeToOriginal for explanation.
                String.prototype.to = StringPrototypeToOriginal; // eslint-disable-line

                if (shelljs) {
                    shelljs.config = shelljsConfig;
                }
                self.stampPerformance('whole build');
                if (process.env.METEOR_DESKTOP_DEBUG) {
                    self.getPerformanceReport();
                }
            }

            const scaffold = new ElectronAppScaffold(context);
            const depsManager = new DependenciesManager(
                context, scaffold.getDefaultPackageJson().dependencies
            );

            this.stampPerformance('readdir');
            const readDirFuture = Future.fromPromise(this.utils.readDir(desktopPath));
            const readDirResult = readDirFuture.wait();
            this.stampPerformance('readdir');

            this.stampPerformance('cache check');
            const cacheGetPromise = Future.fromPromise(cacache.get(this.cachePath, 'last'));
            let lastStats = null;
            try {
                lastStats = cacheGetPromise.wait().data.toString('utf8');
                lastStats = JSON.parse(lastStats);
            } catch (e) {
                logDebug('[meteor-desktop] no cache found');
            }

            if (settings.env !== 'prod' &&
                lastStats &&
                MeteorDesktopBundler.areStatsEqual(lastStats.stats, readDirResult.stats)
            ) {
                logDebug('[meteor-desktop] cache match');
                const cacheAsarGetPromise = Future.fromPromise(cacache.get(this.cachePath, 'lastAsar'));
                const contents = cacheAsarGetPromise.wait();
                if (contents.integrity === lastStats.asarIntegrity) {
                    const cacheSettingsGetPromise = Future.fromPromise(cacache.get(this.cachePath, 'lastSettings'));
                    const lastSettings = JSON.parse(cacheSettingsGetPromise.wait().data.toString('utf8'));
                    if (lastSettings.asarIntegrity === lastStats.asarIntegrity) {
                        addFiles(contents.data, lastSettings.settings);
                        endProcess();
                        return;
                    }
                    logDebug('[meteor-desktop] integrity check of settings failed');
                } else {
                    logDebug('[meteor-desktop] integrity check of asar failed');
                }
            } else {
                if (settings.env !== 'prod') {
                    logDebug('[meteor-desktop] cache miss');
                }
                cacache.rm(this.cachePath, 'last')
                    .then(() => logDebug('[meteor-desktop] cache invalidate'))
                    .catch(e => logDebug('[meteor-desktop] failed to invalidate cache', e));
            }
            this.stampPerformance('cache check');

            this.stampPerformance('build deps lookout');
            try {
                const deps = this.lookForAndRequireDependencies(this.buildDeps);
                ({
                    electronAsar,
                    shelljs,
                    del,
                    babelCore,
                    babelPresetEnv,
                    terser,
                    md5
                } = deps);
            } catch (e) {
                // Look at the declaration of StringPrototypeToOriginal for explanation.
                String.prototype.to = StringPrototypeToOriginal; // eslint-disable-line
                inputFile.error({
                    message: e
                });
                return;
            }
            this.stampPerformance('build deps lookout');

            shelljsConfig = Object.assign({}, shelljs.config);
            shelljs.config.fatal = true;
            shelljs.config.silent = false;

            const desktopTmpPath = './._desktop';
            const desktopTmpAsarPath = './.meteor/local';
            const modulesPath = path.join(desktopTmpPath, 'modules');

            this.stampPerformance('copy .desktop');
            shelljs.rm('-rf', desktopTmpPath);
            shelljs.cp('-rf', desktopPath, desktopTmpPath);
            del.sync([
                path.join(desktopTmpPath, '**', '*.test.js')
            ]);
            this.stampPerformance('copy .desktop');

            this.stampPerformance('compute dependencies');
            const configs = this.gatherModuleConfigs(shelljs, modulesPath, inputFile);
            const dependencies = this.getDependencies(desktopPath, inputFile, configs, depsManager);

            // Pass information about build type to the settings.json.
            settings.env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
            this.stampPerformance('compute dependencies');

            this.stampPerformance('desktop hash');
            const hashFuture = new Future();
            const hashFutureResolve = hashFuture.resolver();

            let desktopHash;
            let hashes;
            let fileContents;

            this.utils.readFilesAndComputeHash(desktopPath, file => file.replace('.desktop', ''))
                .then((result) => {
                    ({ fileContents, fileHashes: hashes, hash: desktopHash } = result);
                    hashFutureResolve();
                })
                .catch((e) => { hashFuture.throw(e); });

            hashFuture.wait();
            this.stampPerformance('desktop hash');

            const version = `${desktopHash}_${settings.env}`;

            console.log(`[meteor-desktop] calculated .desktop hash version is ${version}`);

            settings.desktopVersion = version;
            settings.compatibilityVersion =
                this.calculateCompatibilityVersion(
                    dependencies.getDependencies(), desktopPath, inputFile, md5
                );

            settings.meteorDesktopVersion = this.getVersion();

            if (process.env.METEOR_DESKTOP_PROD_DEBUG) {
                settings.prodDebug = true;
            }

            fs.writeFileSync(
                path.join(desktopTmpPath, 'settings.json'), JSON.stringify(settings, null, 4)
            );

            // Move files that should not be asar'ed.
            this.stampPerformance('extract');

            configs.forEach((config) => {
                const moduleConfig = config;
                if ('extract' in moduleConfig) {
                    if (!Array.isArray(moduleConfig.extract)) {
                        moduleConfig.extract = [moduleConfig.extract];
                    }
                    moduleConfig.extract.forEach((file) => {
                        const filePath = path.join(
                            modulesPath, moduleConfig.dirName, file
                        );

                        shelljs.rm(filePath);
                    });
                }
            });

            this.stampPerformance('extract');

            const options = 'uglifyOptions' in settings ? settings.uglifyOptions : {};
            const uglifyingEnabled = 'uglify' in settings && !!settings.uglify;

            if (babelPresetEnv.default) {
                babelPresetEnv = babelPresetEnv.default;
            }
            const preset = babelPresetEnv({
                version: this.getPackageJsonField('dependencies')['@babel/preset-env'],
                assertVersion: () => { }
            }, { targets: { node: '14' } });

            this.stampPerformance('babel/uglify');
            const promises = [];
            Object.keys(fileContents).forEach((file) => {
                const filePath = path.join(desktopTmpPath, file);
                const cacheKey = `${file}-${hashes[file]}`;

                promises.push(new Promise((resolve, reject) => {
                    cacache.get(this.cachePath, cacheKey)
                        .then((cacheEntry) => {
                            logDebug(`[meteor-desktop] loaded from cache: ${file}`);
                            let code = cacheEntry.data;
                            let error;
                            if (settings.env === 'prod' && uglifyingEnabled) {
                                ({ code, error } = terser.minify(code.toString('utf8'), options));
                            }
                            if (error) {
                                reject(error);
                            } else {
                                fs.writeFileSync(filePath, code);
                                resolve();
                            }
                        })
                        .catch(() => {
                            logDebug(`[meteor-desktop] from disk ${file}`);
                            const fileContent = fileContents[file];
                            let code;
                            babelCore.transform(
                                fileContent,
                                {
                                    presets: [preset]
                                },
                                (err, result) => {
                                    if (err) {
                                        this.watcherEnabled = true;
                                        reject(err);
                                    } else {
                                        ({ code } = result);
                                        cacache.put(this.cachePath, `${file}-${hashes[file]}`, code).then(() => {
                                            logDebug(`[meteor-desktop] cached ${file}`);
                                        });

                                        let uglifiedCode;
                                        let error;
                                        if (settings.env === 'prod' && uglifyingEnabled) {
                                            ({ code: uglifiedCode, error } =
                                                terser.minify(code, options));
                                        }

                                        if (error) {
                                            reject(error);
                                        } else {
                                            // in development mode, uglifiedCode will be undefined, which causes an error since fs.writeFileSync introduced type checking of the data parameter in Node 14.
                                            // https://github.com/wojtkowiak/meteor-desktop/issues/303#issuecomment-1025337912
                                            fs.writeFileSync(filePath, uglifiedCode || code);
                                            resolve();
                                        }
                                    }
                                }
                            );
                        });
                }));
            });

            const all = Future.fromPromise(Promise.all(promises));
            all.wait();
            this.stampPerformance('babel/uglify');

            this.stampPerformance('@electron/asar');

            const future = new Future();
            const resolve = future.resolver();
            const asarPath = path.join(desktopTmpAsarPath, 'desktop.asar');
            electronAsar.createPackage(
                desktopTmpPath,
                asarPath
            )
                .then(() => {
                    resolve();
                });
            future.wait();
            this.stampPerformance('@electron/asar');

            const contents = fs.readFileSync(asarPath);

            function saveCache(desktopAsar, stats, desktopSettings) {
                let asarIntegrity;
                return new Promise((saveCacheResolve, saveCacheReject) => {
                    cacache.put(self.cachePath, 'lastAsar', desktopAsar)
                        .then((integrity) => {
                            asarIntegrity = integrity;
                            return cacache.put(self.cachePath, 'last', JSON.stringify({ stats, asarIntegrity }));
                        })
                        .then(() => cacache.put(
                            self.cachePath,
                            'lastSettings',
                            JSON.stringify({ settings: desktopSettings, asarIntegrity })
                        ))
                        .then(finalIntegrity => saveCacheResolve(finalIntegrity))
                        .catch(saveCacheReject);
                });
            }

            if (settings.env !== 'prod') {
                saveCache(contents, readDirResult.stats, settings)
                    .then(integrity => logDebug('[meteor-desktop] cache saved:', integrity))
                    .catch(e => console.error('[meteor-desktop]: saving cache failed:', e));
            }

            addFiles(contents, settings);
            shelljs.rm(asarPath);

            if (!process.env.METEOR_DESKTOP_DEBUG) {
                this.stampPerformance('remove tmp');
                shelljs.rm('-rf', desktopTmpPath);
                this.stampPerformance('remove tmp');
            }

            endProcess();
        });
    }
}

if (typeof Plugin !== 'undefined') {
    Plugin.registerCompiler(
        { extensions: ['desktop', '_desktop_.js'] },
        () => new MeteorDesktopBundler(Plugin.fs)
    );
}
