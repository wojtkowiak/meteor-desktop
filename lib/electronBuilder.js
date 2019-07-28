// eslint-disable-next-line no-unused-vars
import regeneratorRuntime from 'regenerator-runtime/runtime';
import shell from 'shelljs';
import path from 'path';
import fs from 'fs';
import rimraf from 'rimraf';
import spawn from 'cross-spawn';
import Log from './log';
import defaultDependencies from './defaultDependencies';

/**
 * Promisfied rimraf.
 *
 * @param {string} dirPath - path to the dir to be deleted
 * @param {number} delay - delay the task by ms
 * @returns {Promise<any>}
 */
function removeDir(dirPath, delay = 0) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            rimraf(dirPath, {
                maxBusyTries: 100
            }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        }, delay);
    });
}

/**
 * Wrapper for electron-builder.
 */
export default class InstallerBuilder {
    /**
     * @param {MeteorDesktop} $ - context
     *
     * @constructor
     */
    constructor($) {
        this.log = new Log('electronBuilder');
        this.$ = $;
        this.firstPass = true;
        this.lastRebuild = {};
        this.currentContext = null;
        this.installerDir = path.join(this.$.env.options.output, this.$.env.paths.installerDir);
        this.platforms = [];
    }

    async init() {
        this.builder = await this.$.getDependency('electron-builder', defaultDependencies['electron-builder']);
        const appBuilder = await this.$.getDependency('app-builder-lib', defaultDependencies['electron-builder'], false);

        this.yarn = require(path.join(appBuilder.path, 'out', 'util', 'yarn'));
        this.getGypEnv = this.yarn.getGypEnv;
        this.packageDependencies = require(path.join(appBuilder.path, 'out', 'util', 'packageDependencies'));
    }

    /**
     * Prepares the last rebuild object for electron-builder.
     *
     * @param {string} arch
     * @param {string} platform
     * @returns {Object}
     */
    prepareLastRebuildObject(arch, platform = process.platform) {
        const productionDeps = this.packageDependencies
            .createLazyProductionDeps(this.$.env.paths.electronApp.root);
        this.lastRebuild = {
            frameworkInfo: { version: this.$.getElectronVersion(), useCustomDist: true },
            platform,
            arch,
            productionDeps
        };
        return this.lastRebuild;
    }

    /**
     * Calls npm rebuild from electron-builder.
     * @param {string} arch
     * @param {string} platform
     * @param {boolean} install
     * @returns {Promise}
     */
    async installOrRebuild(arch, platform = process.platform, install = false) {
        this.log.debug(`calling installOrRebuild from electron-builder for arch ${arch}`);
        this.prepareLastRebuildObject(arch, platform);
        await this.yarn.installOrRebuild(this.$.desktop.getSettings().builderOptions || {},
            this.$.env.paths.electronApp.root, this.lastRebuild, install);
    }

    /**
     * Callback invoked before build is made. Ensures that app.asar have the right rebuilt
     * node_modules.
     *
     * @param {Object} context
     * @returns {Promise}
     */
    beforeBuild(context) {
        this.currentContext = Object.assign({}, context);
        return new Promise((resolve, reject) => {
            const platformMatches = process.platform === context.platform.nodeName;
            const rebuild = platformMatches && context.arch !== this.lastRebuild.arch;
            if (!platformMatches) {
                this.log.warn('skipping dependencies rebuild because platform is different, if you have native ' +
                    'node modules as your app dependencies you should od the build on the target platform only');
            }

            if (!rebuild) {
                this.moveNodeModulesOut()
                    .catch(e => reject(e))
                    .then(() => setTimeout(() => resolve(false), 2000));
                // Timeout helps on Windows to clear the file locks.
            } else {
                // Lets rebuild the node_modules for different arch.
                this.installOrRebuild(context.arch, context.platform.nodeName)
                    .catch(e => reject(e))
                    .then(() => this.$.electronApp.installLocalNodeModules(context.arch))
                    .catch(e => reject(e))
                    .then(() => {
                        this.$.electronApp.scaffold.createAppRoot();
                        this.$.electronApp.scaffold.copySkeletonApp();
                        return this.$.electronApp.packSkeletonToAsar(
                            [
                                this.$.env.paths.electronApp.meteorAsar,
                                this.$.env.paths.electronApp.desktopAsar,
                                this.$.env.paths.electronApp.extracted
                            ]
                        );
                    })
                    .catch(e => reject(e))
                    .then(() => this.moveNodeModulesOut())
                    .catch(e => reject(e))
                    .then(() => resolve(false));
            }
        });
    }

    /**
     * Callback to be invoked after packing. Restores node_modules to the .desktop-build.
     * @returns {Promise}
     */
    afterPack(context) {
        this.platforms = this.platforms
            .filter(platform => platform !== context.electronPlatformName);
        if (this.platforms.length !== 0) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            shell.config.fatal = true;

            if (this.$.utils.exists(this.$.env.paths.electronApp.extractedNodeModules)) {
                this.log.debug('injecting extracted modules');
                shell.cp(
                    '-Rf',
                    this.$.env.paths.electronApp.extractedNodeModules,
                    path.join(this.getPackagedAppPath(context), 'node_modules')
                );
            }

            this.log.debug('moving node_modules back');
            // Move node_modules back.

            try {
                shell.mv(
                    this.$.env.paths.electronApp.tmpNodeModules,
                    this.$.env.paths.electronApp.nodeModules
                );
            } catch (e) {
                reject(e);
                return;
            } finally {
                shell.config.reset();
            }

            if (this.firstPass) {
                this.firstPass = false;
            }
            this.log.debug('node_modules moved back');

            this.wait()
                .catch(e => reject(e))
                .then(() => resolve());
        });
    }

    /**
     * This command kills orphaned MSBuild.exe processes.
     * Sometime after native node_modules compilation they are still writing some logs,
     * prevent node_modules from being deleted.
     */
    killMSBuild() {
        if (this.currentContext.platform.nodeName !== 'win32') {
            return;
        }
        try {
            const out = spawn
                .sync(
                    'wmic',
                    ['process', 'where', 'caption="MSBuild.exe"', 'get', 'processid']
                )
                .stdout.toString('utf-8')
                .split('\n');

            const regex = new RegExp(/(\d+)/, 'gm');
            // No we will check for those with the matching params.
            out.forEach((line) => {
                const match = regex.exec(line) || false;
                if (match) {
                    this.log.debug(`killing MSBuild.exe at pid: ${match[1]}`);
                    spawn.sync('taskkill', ['/pid', match[1], '/f', '/t']);
                }
                regex.lastIndex = 0;
            });
        } catch (e) {
            this.log.debug('kill MSBuild failed');
        }
    }

    /**
     * Returns the path to packaged app.
     * @returns {string}
     */
    getPackagedAppPath(context = {}) {
        if (this.currentContext.platform.nodeName === 'darwin') {
            return path.join(
                this.installerDir,
                `${context.packager.appInfo.productFilename}.app`,
                'Contents', 'Resources', 'app'
            );
        }
        const platformDir =
            `${this.currentContext.platform.nodeName === 'win32' ? 'win' : 'linux'}-${this.currentContext.arch === 'ia32' ? 'ia32-' : ''}unpacked`;
        return path.join(
            this.installerDir,
            platformDir,
            'resources', 'app'
        );
    }

    /**
     * On Windows it waits for the app.asar in the packed app to be free (no file locks).
     * @returns {*}
     */
    wait() {
        if (this.currentContext.platform.nodeName !== 'win32') {
            return Promise.resolve();
        }
        const appAsarPath = path.join(
            this.getPackagedAppPath(),
            'app.asar'
        );
        let retries = 0;
        const self = this;
        return new Promise((resolve, reject) => {
            function check() {
                fs.open(appAsarPath, 'r+', (err, fd) => {
                    retries += 1;
                    if (err) {
                        if (err.code !== 'ENOENT') {
                            self.log.debug(`waiting for app.asar to be readable, ${'code' in err ? `currently reading it returns ${err.code}` : ''}`);
                            if (retries < 6) {
                                setTimeout(() => check(), 4000);
                            } else {
                                reject(`file is locked: ${appAsarPath}`);
                            }
                        } else {
                            resolve();
                        }
                    } else {
                        fs.closeSync(fd);
                        resolve();
                    }
                });
            }
            check();
        });
    }

    /**
     * Prepares the target object passed to the electron-builder.
     *
     * @returns {Map<Platform, Map<Arch, Array<string>>>}
     */
    prepareTargets() {
        let arch = this.$.env.options.ia32 ? 'ia32' : 'x64';
        arch = this.$.env.options.allArchs ? 'all' : arch;

        const targets = [];

        if (this.$.env.options.win) {
            targets.push(this.builder.dependency.Platform.WINDOWS);
        }
        if (this.$.env.options.linux) {
            targets.push(this.builder.dependency.Platform.LINUX);
        }
        if (this.$.env.options.mac) {
            targets.push(this.builder.dependency.Platform.MAC);
        }

        if (targets.length === 0) {
            if (this.$.env.os.isWindows) {
                targets.push(this.builder.dependency.Platform.WINDOWS);
            } else if (this.$.env.os.isLinux) {
                targets.push(this.builder.dependency.Platform.LINUX);
            } else {
                targets.push(this.builder.dependency.Platform.MAC);
            }
        }
        return this.builder.dependency.createTargets(targets, null, arch);
    }

    async build() {
        const settings = this.$.desktop.getSettings();
        if (!('builderOptions' in settings)) {
            this.log.error(
                'no builderOptions in settings.json, aborting'
            );
            process.exit(1);
        }

        const builderOptions = Object.assign({}, settings.builderOptions);

        builderOptions.asar = false;
        builderOptions.npmRebuild = true;

        builderOptions.beforeBuild = this.beforeBuild.bind(this);
        builderOptions.afterPack = this.afterPack.bind(this);
        builderOptions.electronVersion = this.$.getElectronVersion();

        builderOptions.directories = {
            app: this.$.env.paths.electronApp.root,
            output: path.join(this.$.env.options.output, this.$.env.paths.installerDir)
        };

        if ('mac' in builderOptions && 'target' in builderOptions.mac) {
            if (builderOptions.mac.target.includes('mas')) {
                this.platforms = ['darwin', 'mas'];
            }
        }

        try {
            this.log.debug('calling build from electron-builder');
            await this.builder.dependency.build(Object.assign({
                targets: this.prepareTargets(),
                config: builderOptions
            }, settings.builderCliOptions));

            if (this.$.utils.exists(this.$.env.paths.electronApp.extractedNodeModules)) {
                shell.rm('-rf', this.$.env.paths.electronApp.extractedNodeModules);
            }
        } catch (e) {
            this.log.error('error while building installer: ', e);
        }
    }

    /**
     * Moves node_modules out of the app because while the app will be packaged
     * we do not want it to be there.
     * @returns {Promise<any>}
     */
    moveNodeModulesOut() {
        return new Promise((resolve, reject) => {
            this.log.debug('moving node_modules out, because we have them already in' +
                ' app.asar');
            this.killMSBuild();
            removeDir(this.$.env.paths.electronApp.tmpNodeModules)
                .catch(e => reject(e))
                .then(() => {
                    shell.config.fatal = true;
                    shell.config.verbose = true;
                    try {
                        shell.mv(
                            this.$.env.paths.electronApp.nodeModules,
                            this.$.env.paths.electronApp.tmpNodeModules
                        );
                        shell.config.reset();
                        return this.wait();
                    } catch (e) {
                        shell.config.reset();
                        return Promise.reject(e);
                    }
                })
                .catch(e => reject(e))
                .then(() => removeDir(this.$.env.paths.electronApp.nodeModules, 1000))
                .catch(e => reject(e))
                .then(() => this.wait())
                .catch(reject)
                .then(resolve);
        });
    }
}
