import fs from 'fs';
import Desktop from './desktop';
import ElectronApp from './electronApp';
import Electron from './electron';
import Env from './env';
import Logger from './log';

/**
 * Main entity.
 */
class MeteorDesktop {

    /**
     * @param {string} input - Meteor app dir.
     * @param {string} output - Output dir for bundle/package/installer.
     * @param {Object} options - Options from cli.js.
     * @param {Object} dependencies - Deps object.
     * @constructor
     */
    constructor(input, output, options, dependencies) {
        const Log = dependencies.log;
        this.log = new Log('index');
        this.log.info('initializing');

        this.env = new Env(input, output, options);

        this.electron = new Electron(this);
        this.electronApp = new ElectronApp(this);
        this.desktop = new Desktop(this);
    }

    init() {
        this.desktop.scaffold();
    }

    async run() {
        await this.electronApp.run();
    }

    justRun() {
        this.electron.run();
    }

    runPackager() {
        this.electron.packageApp();
    }

    /**
     * Exists
     * @param path
     * @returns {boolean}
     */
    exists(path) {
        try {
            fs.accessSync(path);
            return true;
        } catch (e) {
            return false;
        }
    }
}


module.exports = function exports(input, output, options, { log = Logger } = { log: Logger }) {
    return new MeteorDesktop(input, output, options, { log });
};
