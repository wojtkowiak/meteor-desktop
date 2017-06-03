import fs from 'fs';
import spawn from 'cross-spawn';

import Log from './log';

/**
 * Utility class designed for managing Meteor packages.
 *
 * @property {MeteorDesktop} $
 * @class
 */
export default class MeteorManager {

    /**
     * @param {MeteorDesktop} $ - context
     * @constructor
     */
    constructor($) {
        this.log = new Log('meteorManager');
        this.$ = $;
    }

    /**
     * Looks for specified packages in .meteor/packages. In other words checks if the project has
     * specified packages added.
     * @param {Array} packages
     * @returns {boolean}
     */
    checkPackages(packages) {
        const usedPackages = fs.readFileSync(this.$.env.paths.meteorApp.packages, 'UTF-8').split('\n');
        return !packages.some(
            packageToFind =>
                !usedPackages.some(meteorPackage => ~meteorPackage.indexOf(packageToFind))
        );
    }

    /**
     * Looks for specified packages in .meteor/packages. In other words checks if the project has
     * specified packages added.
     * @param {Array} packages
     * @returns {boolean}
     */
    checkPackagesVersion(packages) {
        const usedPackages = fs.readFileSync(this.$.env.paths.meteorApp.versions, 'UTF-8').split('\n');
        return !packages.some(
            packageToFind => !usedPackages.some(meteorPackage => meteorPackage === packageToFind)
        );
    }

    /**
     * Ensures certain packages are added to meteor project and in correct version.
     * @param {Array} packages
     * @param {Array} packagesWithVersion
     * @param {string} who - name of the entity that requests presence of thos packages (can be the
     *                       integration itself or a plugin)
     * @returns {Promise.<void>}
     */
    async ensurePackages(packages, packagesWithVersion, who) {
        if (!this.checkPackages(packages)) {
            this.log.warn(`${who} requires some packages that are not added to project, will try to add them now`);
            try {
                await this.addPackages(packages, packagesWithVersion);
            } catch (e) {
                throw new Error(e);
            }
        }
        if (!this.checkPackagesVersion(packagesWithVersion)) {
            this.log.warn(`${who} required packages version is different, fixing it`);
            try {
                await this.addPackages(packages, packagesWithVersion);
            } catch (e) {
                throw new Error(e);
            }
        }
    }

    /**
     * Removes packages from the meteor app.
     * @param {Array} packages            - array with names of the packages to remove
     */
    deletePackages(packages) {
        this.log.warn('removing packages from meteor project', ...packages);
        return new Promise((resolve, reject) => {
            spawn(
                'meteor',
                ['remove'].concat(packages), {
                    cwd: this.$.env.paths.meteorApp.root,
                    stdio: ['pipe', 'pipe', process.stderr],
                    env: Object.assign(
                        { METEOR_PRETTY_OUTPUT: 0, METEOR_NO_RELEASE_CHECK: 1 }, process.env)
                }
            ).on('exit', (code) => {
                if (code !== 0 || this.checkPackages(packages)) {
                    reject('removeing packages failed');
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Adds packages to the meteor app.
     * @param {Array} packages            - array with names of the packages to add
     * @param {Array} packagesWithVersion - array with names and versions of the packages to add
     */
    addPackages(packages, packagesWithVersion) {
        this.log.info('adding packages to meteor project', ...packagesWithVersion);
        return new Promise((resolve, reject) => {
            spawn(
                'meteor',
                ['add'].concat(
                    packagesWithVersion.map(packageName => packageName.replace('@', '@='))),
                {
                    cwd: this.$.env.paths.meteorApp.root,
                    stdio: ['pipe', 'pipe', process.stderr],
                    env: Object.assign(
                        { METEOR_PRETTY_OUTPUT: 0, METEOR_NO_RELEASE_CHECK: 1 }, process.env)
                }
            ).on('exit', (code) => {
                if (code !== 0 || !this.checkPackages(packages)) {
                    reject('adding packages failed');
                } else {
                    resolve();
                }
            });
        });
    }
}
