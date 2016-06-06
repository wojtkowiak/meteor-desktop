import Log from './log';
import shell from 'shelljs';
import ElectronAppScaffold from './electronAppScaffold';
import DependenciesManager from './dependenciesManager';
import MeteorApp from './meteorApp';
import path from 'path';
const {join} = path;
import assignIn from 'lodash/assignIn';
import fs from 'fs';
import semver from 'semver';
import spawn from 'cross-spawn';

/**
 * Represents the .desktop dir scaffold.
 */
class ElectronApp {

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

    async getMeteorClientBuild() {
        await this.meteorApp.build();
    }

    ensureDeps() {
        return new Promise((resolve, reject) => {
            let version = null;
            let version3 = null;
            let execResult;
            let npm;

            this.log.info('ensuring desktop dependencies');

            if (shell.which('npm')) {
                execResult = shell.exec('npm --version', { silent: true });
                if (execResult.code === 0) {
                    version = execResult.stdout;
                }
            }

            if (version !== null && semver.satisfies(version, '>= 3.0.0')) {
                npm = 'npm';
            }

            if (!npm) {
                if (shell.which('npm3')) {
                    execResult = shell.exec('npm3 --version', { silent: true });
                    if (execResult.code === 0) {
                        version3 = execResult.stdout;
                    }
                }

                if (version3 === null) {
                    this.log.error(`Please install npm in >= 3.0.0! You can do a \`npm install -g 
                    npm3\` if you want npm3 separately. This package will search for either npm v3 
                    or npm3 globally.`
                    );
                    reject();
                }
                npm = 'npm3';
            }

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
                        code => ((code === 0) ? resolve() : this.log.error(`Npm exit code was ${code}`), reject())
                    );
                });
            } else {
                spawn(npm, ['install'], {
                    cwd: this.$.env.paths.electronApp.root,
                    stdio: this.$.env.stdio
                }).on(
                    'exit',
                    code => ((code === 0) ? resolve() : this.log.error(`Npm exit code was ${code}`), reject())
                );
            }
        });
    }

    installDesktop() {
        this.copyFilesFromDesktop();
        this.updatePackageJsonFields();
        this.updateDependencies();
    }

    updateDependencies() {
        this.log.info('updating package.json\'s dependencies');
        const desktopDependencies = this.$.desktop.getDependencies();

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
    }

    updatePackageJsonFields() {
        this.log.info('updating package.json');
        const settings = this.$.desktop.getSettings();
        const packageJson = this.scaffold.getDefaultPackageJson();
        if ('packageJsonFields' in settings) {
            assignIn(packageJson, settings.packageJsonFields);
        }
        fs.writeFileSync(
            this.$.env.paths.electronApp.packageJson, JSON.stringify(packageJson, null, 2)
        );
        this.packageJson = packageJson;
    }

    copyFilesFromDesktop() {
        this.log.info('copying files from .desktop');
        shell.rm('-rf', this.$.env.paths.electronApp.assets);

        const copy = [
            this.$.env.paths.desktop.modules,
            this.$.env.paths.desktop.assets,
            this.$.env.paths.desktop.desktop,
            this.$.env.paths.desktop.settings
        ];

        copy.forEach(pathToCopy => {
            shell.cp(
                '-rf',
                pathToCopy,
                this.$.env.paths.electronApp.root + path.sep
            );
        });
    }


}


module.exports = ElectronApp;

