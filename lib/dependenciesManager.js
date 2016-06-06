import Log from './log';
import { forEach, assignIn, intersection } from 'lodash';
import semverRegex from 'semver-regex';
import semver from 'semver';

class DependenciesManager {

    /**
     * @param {Object} $                   - Context.
     * @param {Object} defaultDependencies - Core dependencies list.
     * @constructor
     */
    constructor($, defaultDependencies) {
        this.log = new Log(this, 'dependenciesManager');
        this.$ = $;
        this.dependencies = defaultDependencies;
        this.semverRangeRegex = /[\|><= ]/gmi;
    }

    getDependencies() {
        return this.dependencies;
    }

    /**
     * Merges depenendencies into one list.
     *
     * @param {string} from - Where the dependencies come from.
     * @param {Object} dependencies - Dependencies list.
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
     * @param {string} from - Where the dependencies come from.
     * @param {Object} dependencies - Dependencies list.
     */
    validateDependenciesVersions(from, dependencies) {
        forEach(dependencies, (version, name) => {
            if (!semverRegex().test(version)) {
                this.log.error(`While processing dependencies from ${from} an invalid semver 
                dependency version: ${name}: ${version} was found.`);
                process.exit(1);
            }
            if (this.semverRangeRegex.test(semver.validRange(version))) {
                this.log.error(`While processing dependencies from ${from} a version range: 
                ${name}: ${version} was found. Please specify a exact version instead of a range.`);
                process.exit(1);
            }
        });
        return true;
    }

    /**
     * Detect duplicates.
     *
     * @param {string} from - Where the dependencies come from.
     * @param {Object} dependencies - Dependencies list.
     */
    detectDuplicatedDependencies(from, dependencies) {
        const duplicates = intersection(Object.keys(dependencies), Object.keys(this.dependencies));
        duplicates.forEach(name => {
            if (dependencies[name] !== this.dependencies[name]) {
                this.log.error(`While processing dependencies from ${from}, a dependency ${name}: 
                ${dependencies[name]} was found to be conflicting with a dependency 
                (${this.dependencies[name]}) that was already declared in other module or it is 
                used in core of the electron app.`);
                process.exit(1);
            }
        });
    }
}

module.exports = DependenciesManager;