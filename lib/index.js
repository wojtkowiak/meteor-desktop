// eslint-disable-next-line no-unused-vars
import regeneratorRuntime from 'regenerator-runtime/runtime';
import fs from 'fs';
import path from 'path';
import shell from 'shelljs';
import Env from './env';
import Electron from './electron';
import Logger from './log';
import Desktop from './desktop';
import ElectronApp from './electronApp';
import MeteorApp from './meteorApp';
import ElectronBuilder from './electronBuilder';
import Packager from './packager';
import utils from './utils';

shell.config.fatal = true;

/**
 * Main entity.
 * @class
 * @property {Env} env
 * @property {Electron} electron
 * @property {InstallerBuilder} installerBuilder
 * @property {ElectronApp} electronApp
 * @property {Desktop} desktop
 * @property {MeteorApp} meteorApp
 */
class MeteorDesktop {
    /**
     * @param {string} input        - Meteor app dir
     * @param {string} output       - output dir for bundle/package/installer
     * @param {Object} options      - options from cli.js
     * @param {Object} dependencies - dependencies object
     * @constructor
     */
    constructor(input, output, options, dependencies) {
        const Log = dependencies.log;
        this.log = new Log('index');
        this.version = this.getVersion();

        this.log.info('initializing');

        this.env = new Env(input, output, options);
        this.electron = new Electron(this);
        this.electronBuilder = new ElectronBuilder(this);
        this.electronApp = new ElectronApp(this);
        this.desktop = new Desktop(this);
        this.meteorApp = new MeteorApp(this);
        this.utils = utils;
    }

    /**
     * Tries to read the version from our own package.json.
     *
     * @returns {string}
     */
    getVersion() {
        if (this.version) {
            return this.version;
        }

        let version = null;
        try {
            ({ version } = JSON.parse(
                fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'UTF-8')
            ));
        } catch (e) {
            this.log.error(`error while trying to read ${path.join(__dirname, 'package.json')}`, e);
            process.exit(1);
        }
        if (process.env.PLUGIN_VERSION &&
            (version.includes('rc') || version.includes('beta') || version.includes('alpha'))
        ) {
            version = process.env.PLUGIN_VERSION;
        }
        return version;
    }

    /**
     * Tries to read the version from our own package.json.
     *
     * @returns {string}
     */
    getElectronVersion() {
        let version = null;
        try {
            const { dependencies = {}, devDependencies = {} } = JSON.parse(
                fs.readFileSync(path.join(this.env.paths.meteorApp.root, 'package.json'), 'UTF-8')
            );
            if (!('electron' in dependencies) && !('electron' in devDependencies)) {
                this.log.error('electron not found in meteor project dependencies');
                process.exit(1);
            }
            version = dependencies.electron || devDependencies.electron;
            if (this.electronApp.depsManager.checks.version.regex.test(version)) {
                ({ version } = JSON.parse(
                    fs.readFileSync(path.join(this.env.paths.meteorApp.root, 'node_modules', 'electron', 'package.json'), 'UTF-8')
                ));
            }
        } catch (e) {
            this.log.error(`error while trying to read ${path.join(this.env.paths.meteorApp.root, 'package.json')}`, e);
            process.exit(1);
        }
        return version;
    }

    async init() {
        this.desktop.scaffold();
        this.meteorApp.updateGitIgnore();
        await this.electronApp.init();
    }

    async buildInstaller(throwError = false) {
        this.env.options.installerBuild = true;
        await this.electronApp.build();
        try {
            await this.electronBuilder.build();
        } catch (e) {
            this.log.error('error occurred while building installer', e);
            if (throwError) {
                throw new Error(e);
            }
        }
    }

    async run() {
        await this.electronApp.build(true);
    }

    async build() {
        await this.electronApp.build();
    }

    justRun() {
        this.electron.run();
    }

    async runPackager() {
        this.packager = new Packager(this);
        await this.packager.init();
        await this.electronApp.build();

        this.packager.packageApp().catch((e) => {
            this.log.error(`while trying to build a package an error occurred: ${e}`);
        });
    }

    async getDependency(name, version, declarationCheck = true) {
        if (declarationCheck) {
            try {
                const { dependencies = {}, devDependencies = {} } = JSON.parse(
                    fs.readFileSync(path.join(this.env.paths.meteorApp.root, 'package.json'), 'UTF-8')
                );
                if (!(name in dependencies) && !(name in devDependencies)) {
                    await this.meteorApp.runNpm(['i', '-D', '-E', '--only=dev', `${name}@${version}`], 'inherit');
                }
            } catch (e) {
                this.log.error(`could no read ${path.join(this.env.paths.meteorApp.root, 'package.json')}`, e);
                process.exit(1);
            }
        }

        const dependencyPath = path.join(this.env.paths.meteorApp.root, 'node_modules', name);
        let dependency = null;
        try {
            dependency = require(dependencyPath);
        } catch (e) {
            if (declarationCheck) {
                this.log.warn(`could not find ${name}, installing the default version for you: ${name}@${version}`);
                try {
                    await this.meteorApp.runNpm(['i', '-D', '-E', '--only=dev', `${name}@${version}`], 'inherit');
                } catch (err) {
                    this.log.error(err);
                    process.exit(1);
                }
            } else {
                this.log.warn(`could not find ${name}, exiting`);
                process.exit(1);
            }
        } finally {
            if (!dependency) {
                dependency = require(dependencyPath);
            }
        }
        const dependencyVersion = require(path.join(dependencyPath, 'package.json')).version;

        if (dependencyVersion !== version) {
            if (dependencyVersion.split('.')[0] !== version.split('.')[0]) {
                this.log.warn(`you are using a ${name}@${dependencyVersion} while the recommended version is ` +
                    `${version}, the compatibility version is different, use at your own risk, be sure to report ` +
                    'that when submitting issues');
            } else {
                this.log.warn(`you are using a ${name}@${dependencyVersion} while the recommended version is ` +
                    `${version}, be sure to report that when submitting issues`);
            }
        }
        return { dependency, path: dependencyPath };
    }
}

export default function exports(input, output, options, { log = Logger } = { log: Logger }) {
    return new MeteorDesktop(input, output, options, { log });
}
