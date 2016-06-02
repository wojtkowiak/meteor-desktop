import fs from 'fs';
import Desktop from './desktop';
import ElectronApp from './electronApp';
import { forEach, values, intersection, assignIn } from 'lodash';
import semverRegex from 'semver-regex';
import semver from 'semver';

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
        this.log = require('./log')(this, 'index');

        this.log.info('initializing', input, output);

        this.env = require('./env')(input, output);
        this.scaffold = require('./scaffold')(this);
        this.electron = require('./electron')(this);
        this.app = require('./app')(this, runFromDist);

        this.electronApp = new ElectronApp(this);
        this.desktop = new Desktop(this);

        this.semverRangeRegex = /[\|><= ]/gmi;
    }

    init() {
        this.desktop.scaffold();
    }

    run() {
        this.electronApp.run();
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

    depsValid(module, deps) {
        forEach(deps, (version, dep) => {
            if (!semverRegex().test(version)) {
                throw new Error(`In module ${module} there is an invalid dependency version: ${dep}: ${version}`);
            }
            if (this.semverRangeRegex.test(semver.validRange(version))) {
                throw new Error(`In module ${module} there is an dependency version range: ${dep}: ${version}. Please specify a strict version instead of a range.`);
            }
        });
        return true;
    }

    checkDuplicatesDeps(module, dependencies, moduleDeps) {
        const duplicates = intersection(Object.keys(dependencies), Object.keys(moduleDeps));
        duplicates.forEach(dep => {
            if (dependencies[dep] !== moduleDeps[dep]) {
                throw new Error(`In module ${module} there is an dependency ${dep}: ${moduleDeps[dep]}. Another version of this dependency (${dependencies[dep]}) was already declared in other module or it is used in core of the electron app.`);
            }
        });
    }


}


module.exports = function exports(input, output, settings) {
    return new MeteorDesktop(input, output, settings);
};
