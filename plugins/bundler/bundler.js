/* eslint-disable no-console, no-param-reassign */
const fs = Plugin.fs;
const path = Plugin.path;
const versionFilePath = './version.desktop';
const Future = Npm.require('fibers/future');
const md5 = Npm.require('md5');

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
        .replace(/-(.)/g, $1 => $1.toUpperCase())
        .replace(/-/g, '');
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
            'asar',
            'shelljs',
            'glob',
            'del',
            'babel-core',
            'hash-files',
            'babel-preset-node6',
            'babel-preset-es2015',
            'uglify-js'
        ];
        this.version = null;
        this.requireLocal = null;
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
                )
            );

            return depsManager.getDependencies();
        } catch (e) {
            file.error({ message: e.message });
            return {};
        }
    }

    /**
     * Calculates a md5 from all dependencies.
     */
    calculateCompatibilityVersion(dependencies, desktopPath, file) {
        let deps = Object.keys(dependencies).sort();
        deps = deps.map(dependency =>
            `${dependency}:${dependencies[dependency]}`
        );
        const mainCompatibilityVersion = this.requireLocal('meteor-desktop/package.json')
            .version
            .split('.');
        const desktopCompatibilityVersion = this.getSettings(desktopPath, file)
            .version
            .split('.')[0];
        deps.push(`meteor-desktop:${mainCompatibilityVersion[0]}.${mainCompatibilityVersion[1]}`);
        deps.push(`desktop-app:${desktopCompatibilityVersion}`);
        if (process.env.METEOR_DESKTOP_DEBUG_DESKTOP_COMPATIBILITY_VERSION) {
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
        } catch (e) {
            // No harm at this moment...
        }

        try {
            // Look for the dependency in meteor-desktop/node_modules.
            // No need to check the version, npm ensures that.
            meteorDesktopScope = this.requireLocal(`meteor-desktop/node_modules/${dependency}`);
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
     * Tries to find and require all node_modules dependencies.
     * @returns {{}}
     */
    lookForAndRequireDependencies() {
        const dependencies = {};
        let versions;

        try {
            // Try to load the dependencies section from meteor-desktop so we will know what are
            // the correct versions.
            versions = this.requireLocal('meteor-desktop/package.json').dependencies;
        } catch (e) {
            throw new Error('could not load package.json from meteor-desktop, is meteor-desktop' +
                ' installed?');
        }

        this.deps.forEach((dependency) => {
            const dependencyCamelCased = toCamelCase(dependency);

            // Lets try to find that dependency.
            dependencies[dependencyCamelCased] =
                this.getDependency(dependency, versions[dependency]);

            if (dependencies[dependencyCamelCased] === null) {
                throw new Error(
                    `error while trying to require ${dependency}, are you sure you have ` +
                    'meteor-desktop installed and using npm3?'
                );
            }
        });

        return dependencies;
    }

    /**
     * Compiles the protocols.index.js file.
     *
     * @param {Array} files - Array with files to process.
     */
    processFilesForTarget(files) {
        let inputFile = null;
        let versionFile = null;
        let requireLocal = null;

        // We need to find the files we are interested in.
        // version._desktop_.js -> METEOR_DESKTOP_VERSION is put there
        // version.desktop -> this file is in the root dir of the project so we can use it's
        //                    `require` to load things from app's node_modules
        files.forEach((file) => {
            if (file.getArch() === 'web.cordova') {
                if (file.getPackageName() === 'omega:meteor-desktop-bundler' &&
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
            const desktopPath = './.desktop';
            const settings = this.getSettings(desktopPath, inputFile);
            if (!settings.desktopHCP) {
                console.warn('[meteor-desktop] not preparing desktop.asar because desktopHCP ' +
                    'is set to false. Remove this plugin if you do not want to use desktopHCP.');
                return;
            }

            console.time('[meteor-desktop]: Preparing desktop.asar took');

            let asar;
            let shelljs;
            let glob;
            let babelCore;
            let hashFiles;
            let babelPresetNode6;
            let babelPresetEs2015;
            let uglifyJs;
            let del;

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

            let DependenciesManager;
            let ElectronAppScaffold;
            try {
                const deps = this.lookForAndRequireDependencies();
                ({
                    asar,
                    shelljs,
                    glob,
                    del,
                    babelCore,
                    hashFiles,
                    babelPresetNode6,
                    babelPresetEs2015,
                    uglifyJs
                } = deps);

                DependenciesManager = requireLocal('meteor-desktop/dist/dependenciesManager').default;
                ElectronAppScaffold =
                    requireLocal('meteor-desktop/dist/electronAppScaffold').default;
            } catch (e) {
                // Look at the declaration of StringPrototypeToOriginal for explanation.
                String.prototype.to = StringPrototypeToOriginal; // eslint-disable-line

                inputFile.error({
                    message: e
                });
                return;
            }
            const context = {
                env: {
                    isProductionBuild: () => process.env.NODE_ENV === 'production',
                    options: {
                        production: process.env.NODE_ENV === 'production'
                    }
                }
            };

            const scaffold = new ElectronAppScaffold(context);
            const depsManager = new DependenciesManager(
                context, scaffold.getDefaultPackageJson().dependencies);
            const desktopTmpPath = './.desktopTmp';
            const modulesPath = path.join(desktopTmpPath, 'modules');

            shelljs.rm('-rf', desktopTmpPath);
            shelljs.cp('-rf', desktopPath, desktopTmpPath);
            del.sync([
                path.join(desktopTmpPath, '**', '*.test.js')
            ]);

            const configs = this.gatherModuleConfigs(shelljs, modulesPath, inputFile);
            const dependencies = this.getDependencies(desktopPath, inputFile, configs, depsManager);
            const version = hashFiles.sync({
                files: [`${desktopPath}${path.sep}**`]
            });

            // Pass information about build type to the settings.json.

            settings.env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
            settings.desktopVersion = version;
            settings.compatibilityVersion =
                this.calculateCompatibilityVersion(dependencies, desktopPath, inputFile);
            fs.writeFileSync(
                path.join(desktopTmpPath, 'settings.json'), JSON.stringify(settings, null, 4)
            );

            // Move files that should not be asar'ed.
            configs.forEach((config) => {
                const moduleConfig = config;
                if ('extract' in moduleConfig) {
                    if (!Array.isArray(moduleConfig.extract)) {
                        moduleConfig.extract = [moduleConfig.extract];
                    }
                    moduleConfig.extract.forEach((file) => {
                        const filePath = path.join(
                            modulesPath, moduleConfig.dirName, file);

                        shelljs.rm(filePath);
                    });
                }
            });

            const options = 'uglifyOptions' in settings ? settings.uglifyOptions : {};
            options.fromString = true;
            const uglifyingEnabled = 'uglify' in settings && !!settings.uglify;

            // Unfortunately `reify` will not work when we require a .js file from an asar archive.
            // So here we will transpile .desktop to have the ES6 modules working.

            // Uglify does not handle ES6 yet, so we will have to transpile to ES5 for now.
            const preset = (uglifyingEnabled && settings.env === 'prod') ?
                babelPresetEs2015 : babelPresetNode6;

            glob.sync(`${desktopTmpPath}/**/*.js`).forEach((file) => {
                let { code } = babelCore.transformFileSync(file, {
                    presets: [preset]
                });
                if (settings.env === 'prod' && uglifyingEnabled) {
                    code = uglifyJs.minify(code, options).code;
                }
                fs.writeFileSync(file, code);
            });

            const future = new Future();
            const resolve = future.resolver();
            asar.createPackage(
                desktopTmpPath,
                './desktop.asar',
                () => {
                    resolve();
                }
            );
            future.wait();

            const versionObject = {
                version: settings.desktopVersion,
                compatibilityVersion: settings.compatibilityVersion
            };

            inputFile.addAsset({
                path: 'version.desktop.json',
                data: JSON.stringify(versionObject, null, 2)
            });

            inputFile.addAsset({
                path: 'desktop.asar',
                data: fs.readFileSync('./desktop.asar')
            });
            versionFile.addJavaScript({
                sourcePath: inputFile.getPathInPackage(),
                path: inputFile.getPathInPackage(),
                data: `METEOR_DESKTOP_VERSION = ${JSON.stringify(versionObject)};`,
                hash: inputFile.getSourceHash(),
                sourceMap: null
            });
            this.version = versionObject;
            shelljs.rm('./desktop.asar');
            shelljs.rm('-rf', desktopTmpPath);
            console.timeEnd('[meteor-desktop]: Preparing desktop.asar took');

            // Look at the declaration of StringPrototypeToOriginal for explanation.
            String.prototype.to = StringPrototypeToOriginal; // eslint-disable-line
        });
    }
}

if (typeof Plugin !== 'undefined') {
    Plugin.registerCompiler(
        { extensions: ['desktop', '_desktop_.js'] },
        () => new MeteorDesktopBundler(Plugin.fs)
    );
}
