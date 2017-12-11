import { build, Platform, createTargets } from 'electron-builder';
import { installOrRebuild } from 'electron-builder-lib/out/util/yarn';
import { getElectronVersion } from 'electron-builder-lib/out/util/electronVersion';
import { readPackageJson } from 'electron-builder-lib/out/util/packageMetadata';
import shell from 'shelljs';
import path from 'path';
import Log from './log';

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
    }

    /**
     * Calls npm rebuild from electron-builder.
     * @param {string} arch
     * @param {string} platform
     * @returns {Promise}
     */
    async installOrRebuild(arch, platform = process.platform) {
        this.log.debug(`calling installOrRebuild from electron-builder for arch ${arch}`);
        const devMetadata = await readPackageJson(this.$.env.paths.meteorApp.packageJson);
        const results = await getElectronVersion(devMetadata,
            this.$.env.paths.meteorApp.root);
        this.lastRebuild = { platform, arch };
        await installOrRebuild(this.$.desktop.getSettings().builderOptions || {},
            this.$.env.paths.electronApp.root, results, platform, arch, false);
    }

    /**
     * Callback invoked before build is made. Ensures that app.asar have the right rebuilt
     * node_modules.
     *
     * @param {Object} context
     * @returns {Promise}
     */
    beforeBuild(context) {
        return new Promise((resolve) => {
            const platformMatches = process.platform === context.platform.nodeName;
            const rebuild = platformMatches && context.arch !== this.lastRebuild.arch;
            if (!platformMatches) {
                this.log.warn('skipping dependencies rebuild because platform is different, if you have native ' +
                    'node modules as your app dependencies you should od the build on the target platform only');
            }

            if (!rebuild) {
                this.moveNodeModulesOut();
                resolve(false);
            } else {
                this.installOrRebuild(context.arch, context.platform.nodeName)
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
                    .then(() => {
                        this.moveNodeModulesOut();
                        resolve(false);
                    });
            }
        });
    }

    /**
     * Callback to be invoked after packing. Restores node_modules to the .desktop-build.
     * @returns {Promise}
     */
    afterPack() {
        return new Promise((resolve) => {
            this.log.debug('moving node_modules back');
            // Move node_modules back.
            shell.mv(
                this.$.env.paths.electronApp.tmpNodeModules,
                this.$.env.paths.electronApp.nodeModules
            );

            if (this.firstPass) {
                this.firstPass = false;
            }

            resolve();
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
            targets.push(Platform.WINDOWS);
        }
        if (this.$.env.options.linux) {
            targets.push(Platform.LINUX);
        }
        if (this.$.env.options.mac) {
            targets.push(Platform.MAC);
        }

        if (targets.length === 0) {
            if (this.$.env.os.isWindows) {
                targets.push(Platform.WINDOWS);
            } else if (this.$.env.os.isLinux) {
                targets.push(Platform.LINUX);
            } else {
                targets.push(Platform.MAC);
            }
        }
        return createTargets(targets, null, arch);
    }

    async build() {
        const settings = this.$.desktop.getSettings();
        if (!('builderOptions' in settings)) {
            this.log.error(
                'no builderOptions in settings.json, aborting');
            process.exit(1);
        }

        const builderOptions = Object.assign({}, settings.builderOptions);

        builderOptions.asar = false;
        builderOptions.npmRebuild = true;

        builderOptions.beforeBuild = this.beforeBuild.bind(this);
        builderOptions.afterPack = this.afterPack.bind(this);

        builderOptions.directories = {
            app: this.$.env.paths.electronApp.root,
            output: path.join(this.$.env.options.output, this.$.env.paths.installerDir)
        };

        try {
            await build(Object.assign({
                targets: this.prepareTargets(),
                config: builderOptions
            }, settings.builderCliOptions));
        } catch (e) {
            this.log.error('error while building installer: ', e);
        }
    }

    moveNodeModulesOut() {
        this.log.debug('moving node_modules out, because we have them already in' +
            ' app.asar');
        shell.mv(
            this.$.env.paths.electronApp.nodeModules,
            this.$.env.paths.electronApp.tmpNodeModules
        );
    }
}
