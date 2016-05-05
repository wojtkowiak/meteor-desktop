import { forEach, assignIn, intersection } from 'lodash';
import semverRegex from 'semver-regex';
import semver from 'semver';

import Log from './log';

/**
 * Utility class designed for merging dependencies list with simple validation and duplicate
 * detection.
 *
 * @class
 */
export default class DependenciesManager {

    /**
     * @param {MeteorDesktop} $                   - context
     * @param {Object}        defaultDependencies - core dependencies list
     * @constructor
     */
    constructor($, defaultDependencies) {
        this.log = new Log('dependenciesManager');
        this.$ = $;
        this.dependencies = defaultDependencies;
        this.semverRangeRegex = /[\|><= ]/gmi;
    }

    /**
     * Just a public getter.
     * @returns {Object}
     */
    getDependencies() {
        return this.dependencies;
    }

    /**
     * Merges dependencies into one list.
     *
     * @param {string} from         - describes where the dependencies were set
     * @param {Object} dependencies - dependencies list
     */
    mergeDependencies(from, dependencies) {
        if (this.validateDependenciesVersions(from, dependencies)) {
            this.detectDuplicatedDependencies(from, dependencies);
            assignIn(this.dependencies, dependencies);
        }
    }

    /**
     * Validates semver and detect ranges.
     *
     * @param {string} from         - describes where the dependencies were set
     * @param {Object} dependencies - dependencies list
     */
    validateDependenciesVersions(from, dependencies) {
        forEach(dependencies, (version, name) => {
            if (!semverRegex().test(version)) {
                throw new Error(`while processing dependencies from ${from} an invalid semver ` +
                    `dependency version: ${name}: ${version} was found.`);
            }
            if (this.semverRangeRegex.test(semver.validRange(version))) {
                throw new Error(`while processing dependencies from ${from} a version range: ` +
                    `${name}: ${version} was found. Please specify a exact version instead of a ` +
                    'range.');
            }
        });
        return true;
    }

    /**
     * Detects duplicates.
     *
     * @param {string} from         - describes where the dependencies were set
     * @param {Object} dependencies - dependencies list
     */
    detectDuplicatedDependencies(from, dependencies) {
        const duplicates = intersection(Object.keys(dependencies), Object.keys(this.dependencies));
        if (duplicates.length > 0) {
            duplicates.forEach((name) => {
                if (dependencies[name] !== this.dependencies[name]) {
                    throw new Error(`While processing dependencies from ${from}, a dependency ` +
                        `${name}: ${dependencies[name]} was found to be conflicting with a ` +
                        `dependency (${this.dependencies[name]}) that was already declared in ` +
                        'other module or it is used in core of the electron app.');
                }
            });
        }
    }
}
