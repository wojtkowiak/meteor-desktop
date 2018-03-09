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

shell.config.fatal = true;

/**
 * Exists
 * @param {string} pathToCheck
 * @returns {boolean}
 */
function exists(pathToCheck) {
    try {
        fs.accessSync(pathToCheck);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Simple wrapper for shelljs.rm with additional retries in case of failure.
 * It is useful when something is concurrently reading the dir you want to remove.
 */
function rmWithRetries(...args) {
    let retries = 0;
    return new Promise((resolve, reject) => {
        function rm(...rmArgs) {
            try {
                shell.config.fatal = true;
                shell.rm(...rmArgs);
                shell.config.reset();
                resolve();
            } catch (e) {
                retries += 1;
                if (retries < 5) {
                    setTimeout(() => {
                        rm(...rmArgs);
                    }, 100);
                } else {
                    shell.config.reset();
                    reject(e);
                }
            }
        }
        rm(...args);
    });
}

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
        this.packager = new Packager(this);
        this.utils = {
            exists,
            rmWithRetries
        };
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
            version = JSON.parse(
                fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'UTF-8')
            ).version;
        } catch (e) {
            this.log.error(`error while trying to read ${path.join(__dirname, 'package.json')}`, e);
            process.exit(1);
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
            version = JSON.parse(
                fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'UTF-8')
            ).dependencies.electron;
        } catch (e) {
            this.log.error(`error while trying to read ${path.join(__dirname, 'package.json')}` +
                'or the electron version from it', e);
            process.exit(1);
        }
        return version;
    }


    init() {
        this.desktop.scaffold();
        this.meteorApp.updateGitIgnore();
    }

    async buildInstaller() {
        this.env.options.installerBuild = true;
        await this.electronApp.build();
        try {
            await this.electronBuilder.build();
        } catch (e) {
            this.log.error('error occurred while building installer', e);
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
        await this.electronApp.build();

        this.packager.packageApp().catch((e) => {
            this.log.error(`while trying to build a package an error occurred: ${e}`);
        });
    }
}

export default function exports(input, output, options, { log = Logger } = { log: Logger }) {
    return new MeteorDesktop(input, output, options, { log });
}
