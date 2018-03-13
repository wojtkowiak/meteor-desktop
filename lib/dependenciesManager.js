import { forEach, assignIn, intersection } from 'lodash';

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

        // Regexes for matching certain types of dependencies version.
        // https://docs.npmjs.com/files/package.json#dependencies
        this.regexes = {
            local: /^(\.\.\/|~\/|\.\/|\/)/,
            git: /^git(\+(ssh|http)s?)?/,
            github: /^\w+-?\w+(?!-)\//,
            http: /^https?.+tar\.gz/,
            file: /^file:/
        };

        // Check for commit hashes.
        const gitCheck = {
            type: 'regex',
            regex: /#[a-f0-9]{7,40}/,
            test: 'match',
            message: 'git or github link must have a commit hash'
        };

        // Check for displaying warnings when npm package from local path is used.
        const localCheck = {
            onceName: 'localCheck',
            type: 'warning',
            message: 'using dependencies from local paths is permitted' +
            ' but dangerous - read more in README.md'
        };

        this.checks = {
            local: localCheck,
            file: localCheck,
            git: gitCheck,
            github: gitCheck,
            version: {
                type: 'regex',
                // Matches all the semver ranges operators, empty strings and `*`.
                regex: /[|><= ~-]|\.x|$^|^\*$/,
                test: 'do not match',
                message: 'semver ranges are forbidden, please specify exact version'
            }
        };
    }

    /**
     * Just a public getter.
     * @returns {Object}
     */
    getDependencies() {
        return this.dependencies;
    }

    /**
     * Returns local dependencies.
     * @returns {Object}
     */
    getLocalDependencies() {
        return Object
            .keys(this.dependencies)
            .filter(
                dependency =>
                    this.regexes.local.test(this.dependencies[dependency]) ||
                    this.regexes.file.test(this.dependencies[dependency])
            )
            .reduce(
                (localDependencies, currentDependency) =>
                    Object.assign(
                        localDependencies,
                        { [currentDependency]: this.dependencies[currentDependency] }
                    ),
                {}
            );
    }

    /**
     * Returns remote dependencies.
     * @returns {Object}
     */
    getRemoteDependencies() {
        return Object
            .keys(this.dependencies)
            .filter(
                dependency =>
                    !this.regexes.local.test(this.dependencies[dependency]) &&
                    !this.regexes.file.test(this.dependencies[dependency])
            )
            .reduce(
                (localDependencies, currentDependency) =>
                    Object.assign(
                        localDependencies,
                        { [currentDependency]: this.dependencies[currentDependency] }
                    ),
                {}
            );
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
     * Detects dependency version type.
     * @param {string} version - version string of the dependency
     * @return {string}
     */
    detectDependencyVersionType(version) {
        const type = Object.keys(this.regexes)
            .find(dependencyType => this.regexes[dependencyType].test(version));
        return type || 'version';
    }

    /**
     * Validates semver and detect ranges.
     *
     * @param {string} from         - describes where the dependencies were set
     * @param {Object} dependencies - dependencies list
     */
    validateDependenciesVersions(from, dependencies) {
        const warningsShown = {};
        forEach(dependencies, (version, name) => {
            const type = this.detectDependencyVersionType(version);
            if (this.checks[type]) {
                const check = this.checks[type];
                if (check.type === 'regex') {
                    const checkResult = check.test === 'match' ?
                        this.checks[type].regex.test(version) :
                        !this.checks[type].regex.test(version);
                    if (!checkResult) {
                        throw new Error(`dependency ${name}:${version} from ${from} failed version ` +
                            `check with message: ${this.checks[type].message}`);
                    }
                }
                if (check.type === 'warning' && !warningsShown[check.onceName]) {
                    warningsShown[check.onceName] = true;
                    this.log.warn(`dependency ${name}:${version} from ${from} caused a` +
                        ` warning: ${check.message}`);
                }
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
