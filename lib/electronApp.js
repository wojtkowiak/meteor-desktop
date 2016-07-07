import Log from './log';
import shell from 'shelljs';
import ElectronAppScaffold from './electronAppScaffold';
import DependenciesManager from './dependenciesManager';
import MeteorApp from './meteorApp';
import path from 'path';
import assignIn from 'lodash/assignIn';
import fs from 'fs';
import spawn from 'cross-spawn';
import asar from 'asar';
import del from 'del';
import glob from 'glob';
import node6Preset from 'babel-preset-node6';
const babel = require('babel-core');

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
    }


    /**
     * Makes an app.asar from the skeleton app.
     * @returns {Promise}
     */
    packSkeletonToAsar() {
        this.log.info('packing skeleton app to asar archive');
        return new Promise((resolve) =>
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

        try {
            await this.ensureDeps();
        } catch (e) {
            this.log.error('error occurred while running npm: ', e);
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
            const npm = path.join(
                this.$.env.paths.meteorApp.root, 'node_modules', '.bin', 'npm3');

            if (this.$.exists(this.$.env.paths.electronApp.nodeModules)) {
                spawn(npm, ['prune'], {
                    cwd: this.$.env.paths.electronApp.root,
                    stdio: this.$.env.stdio
                }).on('exit', () => {
                    spawn(npm, ['install'], {
                        cwd: this.$.env.paths.electronApp.root,
                        stdio: this.$.env.stdio
                    }).on(
                        'exit',
                        code => (
                            (code === 0) ?
                                resolve() : this.log.error(`Npm exit code was ${code}`), reject()
                        )
                    );
                });
            } else {
                spawn(npm, ['install'], {
                    cwd: this.$.env.paths.electronApp.root,
                    stdio: this.$.env.stdio
                }).on(
                    'exit',
                    code => (
                        (code === 0) ?
                            resolve() : this.log.error(`Npm exit code was ${code}`), reject()
                    )
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

            Object.keys(desktopDependencies.modules).forEach(module => {
                this.depsManager.mergeDependencies(
                    `module[${module}]`,
                    desktopDependencies.modules[module]
                );
            });

            this.packageJson.dependencies = this.depsManager.getDependencies();

            fs.writeFileSync(
                this.$.env.paths.electronApp.packageJson, JSON.stringify(this.packageJson, null, 2)
            );
        } catch (e) {
            this.log.error(e.message);
            process.exit(1);
        }
    }

    /**
     * Update package.json fields accordingly to what is set in settings.json.
     */
    updatePackageJsonFields() {
        this.log.info('updating package.json');
        const settings = this.$.desktop.getSettings();
        const packageJson = this.scaffold.getDefaultPackageJson();
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

            // Unfortunately `reify` will not work when we require a .js file from an asar archive.
            // So here we will transpile .desktop to have the ES6 modules working.
            shell.cp('-rf', this.$.env.paths.desktop.root, this.$.env.paths.electronApp.desktopTmp);
            glob.sync(`${this.$.env.paths.electronApp.desktopTmp}/**/*.js`).forEach(file => {
                const { code } = babel.transformFileSync(file, {
                    presets: [node6Preset]
                });
                fs.writeFileSync(file, code);
            });

            asar.createPackage(
                this.$.env.paths.electronApp.desktopTmp,
                this.$.env.paths.electronApp.desktopAsar,
                () => {
                    shell.rm('-rf', this.$.env.paths.electronApp.desktopTmp);
                    resolve();
                }
            );
        });
    }
}
