import fs from 'fs';
import path from 'path';
import Env from './env';
import Electron from './electron';
import Logger from './log';
import Desktop from './desktop';
import ElectronApp from './electronApp';
import MeteorApp from './meteorApp';
import InstallerBuilder from './installerBuilder';

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
     * @param {string} input        - Meteor app dir.
     * @param {string} output       - Output dir for bundle/package/installer.
     * @param {Object} options      - Options from cli.js.
     * @param {Object} dependencies - Dependencies object.
     * @constructor
     */
    constructor(input, output, options, dependencies) {
        const Log = dependencies.log;
        this.log = new Log('index');
        this.version = this.getVersion();

        this.log.info('initializing');

        this.env = new Env(input, output, options);
        this.electron = new Electron(this);
        this.installerBuilder = new InstallerBuilder(this);
        this.electronApp = new ElectronApp(this);
        this.desktop = new Desktop(this);
        this.meteorApp = new MeteorApp(this);
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

    init() {
        this.desktop.scaffold();
    }

    async buildInstaller() {
        await this.electronApp.build();
        try {
            await this.installerBuilder.build();
        } catch (e) {
            console.log(e);
        }
    }

    async run() {
        await this.electronApp.build(true);
    }

    async build() {
        await this.electronApp.build();
    }

    updateDdpUrl() {
        this.electronApp.updateDdpUrl();
    }

    justRun() {
        this.electron.run();
    }

    async runPackager() {
        await this.electronApp.build();

        this.electron.packageApp().catch((e) => {
            this.log.error(`while trying to build a package an error occurred: ${e}`);
        });
    }

    /**
     * Exists
     * @param pathToCheck
     * @returns {boolean}
     */
    exists(pathToCheck) {
        try {
            fs.accessSync(pathToCheck);
            return true;
        } catch (e) {
            return false;
        }
    }
}

export default function exports(input, output, options, { log = Logger } = { log: Logger }) {
    return new MeteorDesktop(input, output, options, { log });
}
