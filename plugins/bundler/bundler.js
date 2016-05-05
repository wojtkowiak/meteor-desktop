/* eslint-disable no-console, no-param-reassign */
const fs = Plugin.fs;
const path = Plugin.path;
const versionFile = './version.desktop';
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

if (!fs.existsSync(versionFile)) {
    fs.writeFileSync(versionFile, JSON.stringify({
        version: 'initial',
    }, null, 2), 'UTF-8');
    addToGitIgnore();
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
        this.version = null;
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
                        message: `duplicate name in 'module.json' in '${module}' - ` +
                        'another module already registered the same name.'
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
    calculateCompatibilityVersion(dependencies, desktopPath, file, requireLocal) {
        let deps = Object.keys(dependencies).sort();
        deps = deps.map(dependency =>
            `${dependency}:${dependencies[dependency]}`
        );
        const mainCompatibilityVersion = requireLocal('meteor-desktop/package.json')
            .version
            .split('.');
        const desktopCompatibilityVersion = this.getSettings(desktopPath, file)
            .version
            .split('.')[0];
        deps.push(`meteor-desktop:${mainCompatibilityVersion[0]}.${mainCompatibilityVersion[1]}`);
        deps.push(`desktop-app:${desktopCompatibilityVersion}`);
        return md5(JSON.stringify(deps));
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

        Profile.time('meteor-desktop: preparing desktop.asar', () => {
            const desktopPath = './.desktop';
            const settings = this.getSettings(desktopPath, inputFile);
            if (!settings.desktopHCP) {
                console.warn('[meteor-desktop] not preparing desktop.asar because desktopHCP ' +
                    'is set to false. Remove this plugin if you do not want to use desktopHCP.');
                return;
            }

            console.time('[meteor-desktop]: Preparing desktop.asar took');

            /* TODO: warn about unexpected versions */
            // When the meteor app requires a different from meteor-desktop version of those
            // deps here we might receive an unexpected version.
            let asar;
            let shell;
            let glob;
            let babel;
            let hash;
            let node6Preset;
            let es2015Preset;
            let uglify;
            let del;

            let DependenciesManager;
            let ElectronAppScaffold;
            try {
                asar = requireLocal('asar');
                shell = requireLocal('shelljs');
                glob = requireLocal('glob');
                del = requireLocal('del');
                babel = requireLocal('babel-core');
                hash = requireLocal('hash-files');
                node6Preset = requireLocal('babel-preset-node6');
                es2015Preset = requireLocal('babel-preset-es2015');
                uglify = requireLocal('uglify-js');

                DependenciesManager = requireLocal('meteor-desktop/dist/dependenciesManager').default;
                ElectronAppScaffold =
                    requireLocal('meteor-desktop/dist/electronAppScaffold').default;
            } catch (e) {
                inputFile.error({
                    message: 'error while trying to require dependency, are you sure you have ' +
                    `meteor-desktop installed and using npm3? ${e}`
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

            shell.rm('-rf', desktopTmpPath);
            shell.cp('-rf', desktopPath, desktopTmpPath);
            del.sync([
                path.join(desktopTmpPath, '**', '*.test.js')
            ]);

            const configs = this.gatherModuleConfigs(shell, modulesPath, inputFile);
            const dependencies = this.getDependencies(desktopPath, inputFile, configs, depsManager);
            const version = hash.sync({
                files: [`${desktopPath}${path.sep}**`]
            });

            // Pass information about build type to the settings.json.

            settings.env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
            settings.desktopVersion = version;
            settings.compatibilityVersion =
                this.calculateCompatibilityVersion(dependencies, desktopPath, inputFile,
                    requireLocal);
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

                        shell.rm(filePath);
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
                es2015Preset : node6Preset;

            glob.sync(`${desktopTmpPath}/**/*.js`).forEach((file) => {
                let { code } = babel.transformFileSync(file, {
                    presets: [preset]
                });
                if (settings.env === 'prod' && uglifyingEnabled) {
                    code = uglify.minify(code, options).code;
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
            shell.rm('./desktop.asar');
            shell.rm('-rf', desktopTmpPath);
            console.timeEnd('[meteor-desktop]: Preparing desktop.asar took');
        });
    }
}

if (typeof Plugin !== 'undefined') {
    Plugin.registerCompiler(
        { extensions: ['desktop', '_desktop_.js'] },
        () => new MeteorDesktopBundler(Plugin.fs)
    );
}
