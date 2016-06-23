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
     * Runs all necessary tasks to run the desktopified app.
     */
    async run() {
        this.log.info('creating electron app');
        this.log.info('scaffolding');

        if (!this.$.desktop.check()) {
            this.log.error('Seems that you do not have a .desktop dir in your project. Run ' +
                '\'meteor-desktop init\' to get it.');
            process.exit(1);
        }

        this.scaffold.make();

        this.installDesktop();

        try {
            await this.ensureDeps();
        } catch (e) {
            this.log.error('error occured while running npm: ', e);
            process.exit(1);
        }

        try {
            await this.getMeteorClientBuild();
        } catch (e) {
            this.log.error('error occurred during getting meteor mobile build: ', e);
        }

        this.log.info('running');
        this.$.electron.run();
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
     * Copies files from the .desktop and updates package.json accordingly to what is defined in
     * either settings.json or any module.json.
     */
    installDesktop() {
        this.copyFilesFromDesktop();
        this.updatePackageJsonFields();
        this.updateDependencies();
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
     * Copies files from .desktop.
     */
    copyFilesFromDesktop() {
        this.log.info('copying files from .desktop');


        asar.createPackage(this.$.env.paths.desktop.root, path.join(this.$.env.paths.electronApp.root, 'desktop.asar'), function() {
            console.log('done.');
        })

       /* shell.rm('-rf', this.$.env.paths.electronApp.assets);

        const copy = [
            this.$.env.paths.desktop.modules,
            this.$.env.paths.desktop.import,
            this.$.env.paths.desktop.assets,
            this.$.env.paths.desktop.desktop,
            this.$.env.paths.desktop.settings
        ];

        copy.forEach(pathToCopy => {
            if (this.$.exists(pathToCopy)) {
                shell.cp(
                    '-rf',
                    pathToCopy,
                    this.$.env.paths.electronApp.root + path.sep
                );
            }
        });*/
    }
}
