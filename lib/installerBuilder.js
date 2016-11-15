import { build, Arch, Platform, createTargets } from 'electron-builder';
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
        this.log = new Log('installerBuilder');
        this.$ = $;
    }

    async build() {
        // Move node_modules away. We do not want to delete it, just temporarily remove it from
        // our way.
        shell.mv(
            this.$.env.paths.electronApp.nodeModules,
            this.$.env.paths.electronApp.tmpNodeModules
        );

        const settings = this.$.desktop.getSettings();
        if (!('builderOptions' in settings)) {
            this.log.error(
                'no builderOptions in settings.json, aborting');
            process.exit(1);
        }

        // We are handling asar'ing and rebuilding in the normal run/build flow so we do not
        // want electron-rebuild to do that.
        settings.builderOptions.asar = false;
        settings.builderOptions.npmRebuild = false;

        const arch = this.$.env.options.ia32 ? 'ia32' : 'x64';

        let target;
        if (this.$.env.os.isWindows) {
            target = createTargets([Platform.WINDOWS], null, arch);
        } else if (this.$.env.os.isLinux) {
            target = createTargets([Platform.LINUX], null, arch);
        } else {
            const targets = [Platform.OSX];
            if (this.$.env.options.win) {
                targets.push(Platform.WINDOWS);
            }
            target = createTargets(targets, null, arch);
        }

        try {
            await build({
                targets: target,
                devMetadata: {
                    directories: {
                        app: this.$.env.paths.electronApp.root,
                        output: path.join(this.$.env.options.output, this.$.env.paths.installerDir)
                    },
                    build: settings.builderOptions
                }
            });
        } catch (e) {
            this.log.error('error while building installer: ', e);
        } finally {
            // Move node_modules back.
            shell.mv(
                this.$.env.paths.electronApp.tmpNodeModules,
                this.$.env.paths.electronApp.nodeModules
            );
        }
    }

}
