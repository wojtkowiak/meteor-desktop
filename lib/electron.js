import spawn from 'cross-spawn';
import pathToElectron from 'electron';

import Log from './log';

/**
 * Simple Electron runner. Runs the project with the bin provided by the 'electron' package.
 * @class
 */
export default class Electron {
    constructor($) {
        this.log = new Log('electron');
        this.$ = $;
    }

    run() {
        // Until: https://github.com/electron-userland/electron-prebuilt/pull/118
        const { env } = process;
        env.ELECTRON_ENV = 'development';

        const cmd = [];

        if (this.$.env.options.debug) {
            cmd.push('--debug=5858');
        }

        cmd.push('.');

        const child = spawn(pathToElectron, cmd, {
            cwd: this.$.env.paths.electronApp.root,
            env
        });

        // TODO: check if we can configure piping in spawn options
        child.stdout.on('data', (chunk) => {
            process.stdout.write(chunk);
        });
        child.stderr.on('data', (chunk) => {
            process.stderr.write(chunk);
        });
    }
}
