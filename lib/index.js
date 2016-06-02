import fs from 'fs';
import Desktop from './desktop';
import ElectronApp from './electronApp';
import { forEach, values, intersection, assignIn } from 'lodash';
import semverRegex from 'semver-regex';
import semver from 'semver';
import Log from './log';

/**
 * Main entity.
 */
class MeteorDesktop {

    /**
     * @param {string} input - Meteor app dir.
     * @param {string} output - Output dir for bundle/package/installer.
     * @param {bool} runFromDist
     * @constructor
     */
    constructor(input, output, runFromDist) {
        this.log = new Log('index');

        this.log.info('initializing');

        this.env = require('./env')(input, output);
        this.scaffold = require('./scaffold')(this);
        this.electron = require('./electron')(this);
        this.app = require('./app')(this, runFromDist);

        this.electronApp = new ElectronApp(this);
        this.desktop = new Desktop(this);


    }

    init() {
        this.desktop.scaffold();
    }

    async run() {
        await this.electronApp.run();
    }

    /**
     * Runs callbacks in a waterfall.
     * @param {Function[]} methods - Array of callbacks.
     */
    waterfall(methods) {
        var self = this;
        var method = methods.shift();
        method[0].apply(method[1], [function callNext() {
            if (methods.length) {
                self.waterfall(methods);
            }
        }]);
    };

    exists(path) {
        try {
            fs.accessSync(path);
            return true;
        } catch (e) {
            return false;
        }
    }




}


module.exports = function exports(input, output, settings) {
    return new MeteorDesktop(input, output, settings);
};
