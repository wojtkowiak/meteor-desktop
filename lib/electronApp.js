import asar from 'asar';
import assignIn from 'lodash/assignIn';
import { transformFileSync } from 'babel-core';
import crypto from 'crypto';
import del from 'del';
import es2015Preset from 'babel-preset-es2015';
import fs from 'fs';
import glob from 'glob';
import hash from 'hash-files';
import node6Preset from 'babel-preset-node6';
import path from 'path';
import shell from 'shelljs';
import spawn from 'cross-spawn';
import uglify from 'uglify-js';
import pathToElectron from 'electron-prebuilt';
import { installNodeHeaders, rebuildNativeModules, shouldRebuildNativeModules, preGypFixRun } from
    'electron-rebuild';

import Log from './log';
import ElectronAppScaffold from './electronAppScaffold';
import DependenciesManager from './dependenciesManager';
import MeteorApp from './meteorApp';

/**
 * Represents the .desktop dir scaffold.
 */
export default class ElectronApp {

    /**
     * @param {Object} $ - Context.
     * @constructor
     */
    constructor($) {
        this.log = new Log('electronApp');
        this.scaffold = new ElectronAppScaffold($);
        this.depsManager = new DependenciesManager(
            $,
            this.scaffold.getDefaultPackageJson().dependencies
        );
        this.meteorApp = new MeteorApp($);
        this.$ = $;
        this.packageJson = null;
        this.version = null;
        this.compatibilityVersion = null;
    }

    /**
     * Makes an app.asar from the skeleton app.
     * @returns {Promise}
     */
    packSkeletonToAsar() {
        this.log.info('packing skeleton app to asar archive');
        return new Promise(resolve =>
            asar.createPackage(
                this.$.env.paths.electronApp.root,
                this.$.env.paths.electronApp.appAsar,
                () => {
                    del.sync([
                        `${this.$.env.paths.electronApp.root}${path.sep}*`,
                        `!${this.$.env.paths.electronApp.nodeModules}`,
                        `!${this.$.env.paths.electronApp.appAsar}`,
                        `!${this.$.env.paths.electronApp.packageJson}`
                    ]);
                    resolve();
                }
            )
        );
    }

    /**
     * Calculates a md5 from all dependencies.
     */
    calculateCompatibilityVersion() {
        const md5 = crypto.createHash('md5');
        let dependencies = Array.sort(Object.keys(this.packageJson.dependencies));
        dependencies = dependencies.map(dependency =>
            `${dependency}:${this.packageJson.dependencies[dependency]}`
        );
        const mainCompatibilityVersion = this.$.getVersion().split('.')[0];
        dependencies.push(`meteor-desktop:${mainCompatibilityVersion}`);
        const desktopCompatibilityVersion = this.$.desktop.getSettings().version.split('.')[0];
        console.log(`desktop-app:${desktopCompatibilityVersion}`);
        dependencies.push(`desktop-app:${desktopCompatibilityVersion}`);
        md5.update(JSON.stringify(dependencies));
        console.log('deps', dependencies);
        this.compatibilityVersion = md5.digest('hex');
    }

    /**
     * Runs all necessary tasks to run the desktopified app.
     */
    async run(run = true) {
        this.log.info('creating electron app');
        this.log.info('scaffolding');

        if (!this.$.desktop.check()) {
            this.log.error('Seems that you do not have a .desktop dir in your project. Run ' +
                '\'meteor-desktop init\' to get it.');
            process.exit(1);
        }

        await this.scaffold.make();

        this.updatePackageJsonFields();
        this.updateDependencies();
        this.calculateCompatibilityVersion();

        try {
            await this.ensureDeps();
        } catch (e) {
            this.log.error('error occurred while running npm: ', e);
            process.exit(1);
        }
        this.log.info('rebuilding native node modules if necessary');
        try {
            await this.rebuildDeps();
        } catch (e) {
            this.log.error('error occurred while rebuilding deps: ', e);
            process.exit(1);
        }

        await this.packSkeletonToAsar();

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

    updateDdpUrl() {
        if (!this.meteorApp.isCordovaBuildReady()) {
            this.log.error(
                'it seems that a cordova build is not ready, please run full build first');
            process.exit(1);
        }
        try {
            this.meteorApp.updateDdpUrl();
        } catch (e) {
            this.log.error(`error while trying to change the ddp url: ${e.message}`);
        }
    }


    /**
     * Builds meteor app.
     */
    async getMeteorClientBuild() {
        await this.meteorApp.build();
    }

    /**
     * Runs npm in the electron app to get the dependencies installed.
     * @returns {Promise}
     */
    ensureDeps() {
        return new Promise((resolve, reject) => {
            // TODO: find a way to run npm without depending on it cause it a huge dependency.
            const npm = path.join(
                this.$.env.paths.meteorApp.root, 'node_modules', '.bin', 'npm');

            if (this.$.exists(this.$.env.paths.electronApp.nodeModules)) {

                spawn(npm, ['prune'], {
                    cwd: this.$.env.paths.electronApp.root,
                    stdio: 'ignore'
                }).on('exit', () =>
                    spawn(npm, ['install'], {
                        cwd: this.$.env.paths.electronApp.root,
                        stdio: this.$.env.stdio
                    }).on(
                        'exit',
                        code =>
                            ((code === 0) ?
                                resolve() : reject(`npm exit code was ${code}`))
                    )
                );
            } else {
                spawn(npm, ['install'], {
                    cwd: this.$.env.paths.electronApp.root,
                    stdio: this.$.env.stdio
                }).on(
                    'exit',
                    code =>
                        ((code === 0) ?
                            resolve() : reject(`npm exit code was ${code}`))
                );
            }
        });
    }

    /**
     * Merges core dependency list with the list made from .desktop.
     */
    updateDependencies() {
        this.log.info('updating package.json\'s dependencies');
        const desktopDependencies = this.$.desktop.getDependencies();

        try {
            this.depsManager.mergeDependencies(
                'settings.json[dependencies]',
                desktopDependencies.fromSettings
            );
            this.depsManager.mergeDependencies(
                'settings.json[plugins]',
                desktopDependencies.plugins
            );

            Object.keys(desktopDependencies.modules).forEach(module =>
                this.depsManager.mergeDependencies(
                    `module[${module}]`,
                    desktopDependencies.modules[module]
                )
            );

            this.packageJson.dependencies = this.depsManager.getDependencies();

            fs.writeFileSync(
                this.$.env.paths.electronApp.packageJson, JSON.stringify(this.packageJson, null, 2)
            );
        } catch (e) {
            this.log.error(e.message);
            process.exit(1);
        }
    }

    rebuildDeps() {
        return new Promise((resolve, reject) => {
            shouldRebuildNativeModules(pathToElectron)
                .then((shouldBuild) => {
                    if (!shouldBuild) return true;

                    const version = JSON.parse(fs.readFileSync(
                        path.join(
                            this.$.env.paths.meteorApp.root,
                            'node_modules',
                            'electron-prebuilt',
                            'package.json'
                        ), 'UTF-8')
                    ).version;
                    const arch = this.$.env.options.ia32 ? 'ia32' : 'x64';
                    return installNodeHeaders(version)
                        .then(() =>
                            rebuildNativeModules(version, this.$.env.paths.electronApp.nodeModules, undefined, undefined, arch)
                                .then(() => (preGypFixRun('./node_modules', true, pathToElectron), resolve()))
                                .catch(reject)
                        )
                        .catch(reject);
                })
                .catch((e) => {
                    console.error("Building modules didn't work!");
                    console.error(e);
                    reject(e);
                });
        });
    }

    /**
     * Update package.json fields accordingly to what is set in settings.json.
     */
    updatePackageJsonFields() {
        this.log.info('updating package.json');
        const settings = this.$.desktop.getSettings();
        let packageJson = this.scaffold.getDefaultPackageJson();
        packageJson.version = settings.version;
        if ('packageJsonFields' in settings) {
            assignIn(packageJson, settings.packageJsonFields);
        }
        assignIn(packageJson, { name: settings.projectName });
        fs.writeFileSync(
            this.$.env.paths.electronApp.packageJson, JSON.stringify(packageJson, null, 4)
        );
        this.packageJson = packageJson;
    }

    /**
     * Copies files from .desktop to desktop.asar.
     */
    packDesktopToAsar() {
        return new Promise(resolve => {
            this.log.info('copying files from .desktop');

            const version = hash.sync({
                files: [`${this.$.env.paths.desktop.root}${path.sep}**`]
            });

            shell.cp('-rf', this.$.env.paths.desktop.root, this.$.env.paths.desktopTmp.root);

            // Pass information about build type to the settings.json.
            const settings = this.$.desktop.getSettings();
            settings.env = ('production' in this.$.env.options
                && this.$.env.options.production) ? 'prod' : 'dev';
            settings.desktopVersion = version;
            settings.compatibilityVersion = this.compatibilityVersion;
            fs.writeFileSync(
                this.$.env.paths.desktopTmp.settings, JSON.stringify(settings, null, 4)
            );

            // Ensure empty `extracted` dir
            shell.rm('-rf', this.$.env.paths.electronApp.extracted);
            shell.mkdir(this.$.env.paths.electronApp.extracted);

            const configs = this.$.desktop.gatherModuleConfigs();

            // Move files that should not be asar'ed.
            configs.forEach(config => {
                const moduleConfig = config;
                if ('extract' in moduleConfig) {
                    if (!Array.isArray(moduleConfig.extract)) {
                        moduleConfig.extract = [moduleConfig.extract];
                    }
                    moduleConfig.extract.forEach(file => {
                        const filePath = path.join(
                            this.$.env.paths.desktopTmp.modules, moduleConfig.dirName, file);
                        const destinationPath = path.join(
                            this.$.env.paths.electronApp.extracted, moduleConfig.dirName);

                        shell.mkdir(destinationPath);
                        shell.mv(filePath, destinationPath);
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

            glob.sync(`${this.$.env.paths.desktopTmp.root}/**/*.js`).forEach(file => {
                let { code } = transformFileSync(file, {
                    presets: [preset]
                });
                if (settings.env === 'prod' && uglifyingEnabled) {
                    code = uglify.minify(code, options).code;
                }
                fs.writeFileSync(file, code);
            });

            asar.createPackage(
                this.$.env.paths.desktopTmp.root,
                this.$.env.paths.electronApp.desktopAsar,
                () => {
                    //shell.rm('-rf', this.$.env.paths.desktopTmp.root);
                    resolve();
                }
            );
        });
    }
}
