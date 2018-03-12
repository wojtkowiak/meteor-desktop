import asar from 'asar';
import assignIn from 'lodash/assignIn';
import _ from 'lodash';
import { LocalInstaller, PackageJson, progress, saveIfNeeded } from 'install-local';
import { transformFileSync } from 'babel-core';
import crypto from 'crypto';
import del from 'del';
import es2015Preset from 'babel-preset-es2015';
import fs from 'fs';
import glob from 'glob';
import node6Preset from 'babel-preset-node6';
import path from 'path';
import shell from 'shelljs';
import spawn from 'cross-spawn';
import semver from 'semver';
import uglify from 'uglify-js';

import { getGypEnv } from 'electron-builder-lib/out/util/yarn';
import { readPackageJson } from 'install-local/src/helpers';

import Log from './log';
import ElectronAppScaffold from './electronAppScaffold';
import DependenciesManager from './dependenciesManager';

shell.config.fatal = true;

/**
 * Represents the .desktop dir scaffold.
 * @class
 */
export default class ElectronApp {

    /**
     * @param {MeteorDesktop} $ - context
     * @constructor
     */
    constructor($) {
        this.log = new Log('electronApp');
        this.scaffold = new ElectronAppScaffold($);
        this.depsManager = new DependenciesManager(
            $,
            this.scaffold.getDefaultPackageJson().dependencies
        );
        this.$ = $;
        this.meteorApp = this.$.meteorApp;
        this.packageJson = null;
        this.version = null;
        this.compatibilityVersion = null;
    }

    /**
     * Makes an app.asar from the skeleton app.
     * @property {Array} excludeFromDel - list of paths to exclude from deleting
     * @returns {Promise}
     */
    packSkeletonToAsar(excludeFromDel = []) {
        this.log.info('packing skeleton app and node_modules to asar archive');
        return new Promise((resolve) => {
            // We want to pack skeleton app and node_modules together, so we need to temporarily
            // move node_modules to app dir.
            this.log.debug('moving node_modules to app dir');
            shell.mv(
                this.$.env.paths.electronApp.nodeModules,
                path.join(this.$.env.paths.electronApp.appRoot, 'node_modules')
            );
            this.log.debug('packing');
            asar.createPackage(
                this.$.env.paths.electronApp.appRoot,
                this.$.env.paths.electronApp.appAsar,
                () => {
                    // Lets move the node_modules back.
                    this.log.debug('moving node_modules back from app dir');
                    shell.mv(
                        path.join(this.$.env.paths.electronApp.appRoot, 'node_modules'),
                        this.$.env.paths.electronApp.nodeModules
                    );
                    this.log.debug('deleting source files');
                    const exclude = Array.concat([
                        this.$.env.paths.electronApp.nodeModules,
                        this.$.env.paths.electronApp.appAsar,
                        this.$.env.paths.electronApp.packageJson
                    ], excludeFromDel);

                    del.sync(
                        Array.concat(
                            [`${this.$.env.paths.electronApp.root}${path.sep}*`],
                            exclude.map(pathToExclude => `!${pathToExclude}`)
                        )
                    );
                    resolve();
                }
            );
        });
    }

    /**
     * Calculates a md5 from all dependencies.
     */
    calculateCompatibilityVersion() {
        this.log.verbose('calculating compatibility version');
        const settings = this.$.desktop.getSettings();

        if (('desktopHCPCompatibilityVersion' in settings)) {
            this.compatibilityVersion = `${settings.desktopHCPCompatibilityVersion}`;
            this.log.warn(`compatibility version overridden to ${this.compatibilityVersion}`);
            return;
        }

        const md5 = crypto.createHash('md5');
        let dependencies = Array.sort(Object.keys(this.packageJson.dependencies));
        dependencies = dependencies.map(dependency =>
            `${dependency}:${this.packageJson.dependencies[dependency]}`
        );
        const mainCompatibilityVersion = this.$.getVersion().split('.');
        this.log.debug('meteor-desktop compatibility version is ',
            `${mainCompatibilityVersion[0]}.${mainCompatibilityVersion[1]}`);
        dependencies.push(
            `meteor-desktop:${mainCompatibilityVersion[0]}.${mainCompatibilityVersion[1]}`);

        const desktopCompatibilityVersion = settings.version.split('.')[0];
        this.log.debug('.desktop compatibility version is ', desktopCompatibilityVersion);
        dependencies.push(
            `desktop-app:${desktopCompatibilityVersion}`);

        if (process.env.METEOR_DESKTOP_DEBUG_DESKTOP_COMPATIBILITY_VERSION ||
            process.env.METEOR_DESKTOP_DEBUG
        ) {
            this.log.debug(`compatibility version calculated from ${JSON.stringify(dependencies)}`);
        }

        md5.update(JSON.stringify(dependencies));

        this.compatibilityVersion = md5.digest('hex');
    }

    /**
     * Runs all necessary tasks to build the desktopified app.
     */
    async build(run = false) {
        // TODO: refactor to a task runner
        this.log.info('scaffolding');

        if (!this.$.desktop.check()) {
            if (!this.$.env.options.scaffold) {
                this.log.error('seems that you do not have a .desktop dir in your project or it is' +
                    ' corrupted. Run \'npm run desktop -- init\' to get a new one.');
                // Do not fail, so that npm will not print his error stuff to console.
                process.exit(0);
            } else {
                this.$.desktop.scaffold();
                this.$.meteorApp.updateGitIgnore();
            }
        }

        try {
            this.$.meteorApp.updateGitIgnore();
        } catch (e) {
            this.log.warn(`error occurred while adding ${this.$.env.paths.electronApp.rootName}` +
                'to .gitignore: ', e);
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
        }

        // TODO: find a way to avoid copying .desktop to a temp location
        try {
            this.copyDesktopToDesktopTemp();
        } catch (e) {
            this.log.error('error while copying .desktop to a temporary location: ', e);
            process.exit(1);
        }

        try {
            this.updateSettingsJsonFields();
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
            this.transpileAndMinify();
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
     * Ensures all required dependencies are added to the Meteor project.
     * @returns {Promise.<void>}
     */
    async ensureMeteorDependencies() {
        const packages = [];
        const packagesWithVersion = [];
        let plugins = 'plugins [';

        Object.keys(this.$.desktop.getDependencies().plugins).forEach((plugin) => {
            // Read package.json of the plugin.
            const packageJson =
                JSON.parse(
                    fs.readFileSync(
                        path.join(
                            this.$.env.paths.electronApp.nodeModules, plugin, 'package.json'),
                        'utf8'
                    )
                );

            if ('meteorDependencies' in packageJson && typeof packageJson.meteorDependencies === 'object') {
                plugins += `${plugin}, `;
                packages.unshift(...Object.keys(packageJson.meteorDependencies));
                packagesWithVersion.unshift(...packages.map((packageName) => {
                    if (packageJson.meteorDependencies[packageName] === '@version') {
                        return `${packageName}@${packageJson.version}`;
                    }
                    return `${packageName}@${packageJson.meteorDependencies[packageName]}`;
                }));
            }
        });

        if (packages.length > 0) {
            plugins = `${plugins.substr(0, plugins.length - 2)}]`;
            try {
                await this.$.meteorApp.meteorManager.ensurePackages(
                    packages, packagesWithVersion, plugins);
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
                await this.$.utils.rmWithRetries(
                    '-rf', this.$.env.paths.electronApp.nodeModules);
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
                shell.mv(
                    this.$.env.paths.electronApp.tmpNodeModules,
                    this.$.env.paths.electronApp.nodeModules
                );
            } else {
                // If there is a node_modules folder, we should clear the temporary one.
                this.log.debug('clearing temp node_modules because new one is already created');
                try {
                    await this.$.utils.rmWithRetries(
                        '-rf', this.$.env.paths.electronApp.tmpNodeModules);
                } catch (e) {
                    throw new Error(e);
                }
            }
        }
    }

    /**
     * NOT IN USE RIGHT NOW // DEPRECATED
     *
     * Wrapper for spawning npm.
     * @param {Array}  commands - commands for spawn
     * @param {string} stdio
     * @return {Promise}
     */
    runNpm(commands, stdio = 'ignore') {
        return new Promise((resolve, reject) => {
            // TODO: find a way to run npm without depending on it cause it's a huge dependency.
            let npm = path.join(
                this.$.env.paths.meteorApp.root, 'node_modules', '.bin', 'npm');

            if (!this.$.utils.exists(npm)) {
                npm = path.join(
                    this.$.env.paths.meteorApp.root, 'node_modules', 'meteor-desktop', 'node_modules', '.bin', 'npm');
            }

            this.log.verbose(`executing npm ${commands.join(' ')}`);

            spawn(npm, commands, {
                cwd: this.$.env.paths.electronApp.root,
                stdio
            }).on('exit', code => (
                    (code === 0) ? resolve() : reject(`npm exit code was ${code}`)
                )
            );
        });
    }


    /**
     * Runs npm link for every package specified in settings.json->linkPackages.
     */
    async linkNpmPackages() {
        const settings = this.$.desktop.getSettings();
        const promises = [];
        if ('linkPackages' in this.$.desktop.getSettings()) {
            if (Array.isArray(settings.linkPackages)) {
                settings.linkPackages.forEach(packageName =>
                    promises.push(this.runNpm(['link', packageName]))
                );
            }
        }
        await Promise.all(promises);
    }

    /**
     * Runs npm in the electron app to get the dependencies installed.
     * @returns {Promise}
     */
    async ensureDeps() {
        await this.linkNpmPackages();

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
        const settingsJson = JSON.parse(
            fs.readFileSync(path.join(this.$.env.paths.scaffold, 'settings.json'))
        );
        const scaffoldPluginsVersion = this.$.desktop.getDependencies(settingsJson, false).plugins;
        Object.keys(pluginsVersions).forEach((pluginName) => {
            if (pluginName in scaffoldPluginsVersion &&
                scaffoldPluginsVersion[pluginName] !== pluginsVersions[pluginName] &&
                semver.lt(pluginsVersions[pluginName], scaffoldPluginsVersion[pluginName])
            ) {
                this.log.warn(`you are using outdated version ${pluginsVersions[pluginName]} of ` +
                    `${pluginName}, the suggested version to use is ` +
                    `${scaffoldPluginsVersion[pluginName]}`);
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
        this.depsManager.mergeDependencies(
            'settings.json[dependencies]',
            desktopDependencies.fromSettings
        );
        this.log.debug('merging settings.json[plugins]');
        this.depsManager.mergeDependencies(
            'settings.json[plugins]',
            desktopDependencies.plugins
        );

        this.log.debug('merging dependencies from modules');
        Object.keys(desktopDependencies.modules).forEach(module =>
            this.depsManager.mergeDependencies(
                `module[${module}]`,
                desktopDependencies.modules[module]
            )
        );

        this.packageJson.dependencies = this.depsManager.getRemoteDependencies();
        this.packageJson.localDependencies = this.depsManager.getLocalDependencies();

        this.log.debug('writing updated package.json');
        fs.writeFileSync(
            this.$.env.paths.electronApp.packageJson, JSON.stringify(this.packageJson, null, 2)
        );
    }

    /**
     * Install node modules from local paths using local-install.
     *
     * @param {string} arch
     * @returns {Promise}
     */
    installLocalNodeModules(arch = this.$.env.options.ia32 || process.arch === 'ia32' ? 'ia32' : 'x64') {
        const localDependencies = _.values(this.packageJson.localDependencies);
        if (localDependencies.length === 0) {
            return Promise.resolve();
        }
        this.log.info('installing local node modules');
        const lastRebuild = this.$.electronBuilder.prepareLastRebuildObject(arch);
        const env = getGypEnv(lastRebuild.frameworkInfo, lastRebuild.platform, lastRebuild.arch);
        const installer = new LocalInstaller(
            { [this.$.env.paths.electronApp.root]: localDependencies },
            { npmEnv: env }
        );
        progress(installer);
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
            assignIn(packageJson, settings.packageJsonFields);
        }
        assignIn(packageJson, { name: settings.projectName });

        this.log.debug('writing updated package.json');
        fs.writeFileSync(
            this.$.env.paths.electronApp.packageJson, JSON.stringify(packageJson, null, 4)
        );
        this.packageJson = packageJson;
    }

    /**
     * Updates settings.json with env (prod/dev) information and versions.
     */
    updateSettingsJsonFields() {
        this.log.debug('updating settings.json fields');
        const settings = this.$.desktop.getSettings();

        // Save versions.
        settings.desktopVersion = this.$.desktop.getHashVersion();
        settings.compatibilityVersion = this.compatibilityVersion;

        // Pass information about build type to the settings.json.
        settings.env = (this.$.env.isProductionBuild()) ?
            'prod' : 'dev';

        settings.meteorDesktopVersion = this.$.getVersion();

        fs.writeFileSync(
            this.$.env.paths.desktopTmp.settings, JSON.stringify(settings, null, 4)
        );
    }

    /**
     * Copies files from prepared .desktop to desktop.asar in electron app.
     */
    packDesktopToAsar() {
        this.log.info('packing .desktop to asar');
        return new Promise((resolve, reject) => {
            asar.createPackage(
                this.$.env.paths.desktopTmp.root,
                this.$.env.paths.electronApp.desktopAsar,
                () => {
                    this.log.verbose('clearing temporary .desktop');
                    this.$.utils
                        .rmWithRetries('-rf', this.$.env.paths.desktopTmp.root)
                        .then(() => {
                            resolve();
                        })
                        .catch((e) => {
                            reject(e);
                        });
                }
            );
        });
    }

    /**
     * Makes a temporary copy of .desktop.
     */
    copyDesktopToDesktopTemp() {
        this.log.verbose('copying .desktop to temporary location');
        shell.cp('-rf', this.$.env.paths.desktop.root, this.$.env.paths.desktopTmp.root);
        // Remove test files.
        del.sync([
            path.join(this.$.env.paths.desktopTmp.root, '**', '*.test.js')
        ]);
    }


    /**
     * Runs babel and uglify over .desktop if requested.
     */
    transpileAndMinify() {
        this.log.info('transpiling and uglifying');

        const settings = this.$.desktop.getSettings();
        const options = 'uglifyOptions' in settings ? settings.uglifyOptions : {};
        options.fromString = true;
        const uglifyingEnabled = 'uglify' in settings && !!settings.uglify;

        // Unfortunately `reify` will not work when we require a .js file from an asar archive.
        // So here we will transpile .desktop to have the ES6 modules working.

        // Uglify does not handle ES6 yet, so we will have to transpile to ES5 for now.
        const preset = (uglifyingEnabled && settings.env === 'prod') ?
            es2015Preset : node6Preset;

        glob.sync(`${this.$.env.paths.desktopTmp.root}/**/*.js`).forEach((file) => {
            let { code } = transformFileSync(file, {
                presets: [preset]
            });
            if (settings.env === 'prod' && uglifyingEnabled) {
                code = uglify.minify(code, options).code;
            }
            fs.writeFileSync(file, code);
        });
    }

    /**
     * Moves all the files that should not be packed into asar into a safe location which is the
     * 'extracted' dir in the electron app.
     */
    async excludeFilesFromArchive() {
        this.log.info('excluding files from packing');

        // Ensure empty `extracted` dir

        try {
            await this.$.utils.rmWithRetries('-rf', this.$.env.paths.electronApp.extracted);
        } catch (e) {
            throw new Error(e);
        }

        shell.mkdir(this.$.env.paths.electronApp.extracted);

        const configs = this.$.desktop.gatherModuleConfigs();

        // Move files that should not be asar'ed.
        configs.forEach((config) => {
            const moduleConfig = config;
            if ('extract' in moduleConfig) {
                if (!Array.isArray(moduleConfig.extract)) {
                    moduleConfig.extract = [moduleConfig.extract];
                }
                moduleConfig.extract.forEach((file) => {
                    this.log.debug(`excluding ${file} from ${config.name}`);
                    const filePath = path.join(
                        this.$.env.paths.desktopTmp.modules, moduleConfig.dirName, file);
                    const destinationPath = path.join(
                        this.$.env.paths.electronApp.extracted, moduleConfig.dirName);

                    if (!this.$.utils.exists(destinationPath)) {
                        shell.mkdir(destinationPath);
                    }
                    shell.mv(filePath, destinationPath);
                });
            }
        });
    }
}
