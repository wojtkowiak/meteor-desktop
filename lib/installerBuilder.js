import builder from 'electron-builder';
import Log from './log';
const Platform = builder.Platform;
const Arch = builder.Arch;

/**
 *
 */
export default class InstallerBuilder {

    /**
     * @param {Object} $ - Context.
     *
     * @constructor
     */
    constructor($) {
        this.log = new Log('installerBuilder');
        this.$ = $;
    }

    async build() {
        try {
            await this.$.electronApp.ensureDeps();
        } catch (e) {
            this.log.error('error occurred while running npm: ', e);
            process.exit(1);
        }
        this.log.info('rebuilding native node modules if necessary');
        try {
            await this.$.electronApp.rebuildDeps();
        } catch (e) {
            this.log.error('error occurred while rebuilding deps: ', e);
            process.exit(1);
        }

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

        const arch = this.$.env.options.ia32 ? Arch.ia32 : Arch.x64;

        return builder.build({
            targets: Platform.WINDOWS.createTarget(null, arch),
            devMetadata: {
                directories: {
                    app: this.$.env.paths.electronApp.root
                },
                build: settings.builderOptions
            }
        });
    }

}
