import regeneratorRuntime from 'regenerator-runtime/runtime';
import assignIn from 'lodash/assignIn';
import path from 'path';
import fs from 'fs';
import shell from 'shelljs';
import packager from 'electron-packager';

import Log from './log';

const { join } = path;

/**
 * Wrapper around electron-packager.
 * @class
 */
export default class ElectronPackager {
    constructor($) {
        this.log = new Log('electron-packager');
        this.$ = $;
    }

    /**
     * Runs the packager with provided arguments.
     *
     * @param {Object} args
     * @returns {Promise}
     */
    runPackager(args) {
        return new Promise((resolve, reject) => {
            packager(args, (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.log.info(`wrote packaged app to ${this.$.env.paths.packageDir}`);
                    resolve();
                }
            });
        });
    }

    async packageApp() {
        const { version } = JSON.parse(fs.readFileSync(
            join(
                this.$.env.paths.meteorApp.root,
                'node_modules',
                'electron',
                'package.json'
            ), 'UTF-8'
        ));

        const settings = this.$.desktop.getSettings();
        const { name } = settings;
        if (!name) {
            this.log.error('`name` field in settings.json not set');
            process.exit(1);
        }

        const arch = this.$.env.options.ia32 ? 'ia32' : 'x64';

        this.log.info(
            `packaging '${name}' for platform '${this.$.env.sys.platform}-${arch}'` +
            ` using electron v${version}`
        );

        try {
            await this.$.utils.rmWithRetries(
                '-rf', path.join(this.$.env.options.output, this.$.env.paths.packageDir)
            );
        } catch (e) {
            throw new Error(e);
        }

        const args = {
            name,
            arch,
            prune: false,
            electronVersion: version,
            platform: this.$.env.sys.platform,
            dir: this.$.env.paths.electronApp.root,
            out: path.join(this.$.env.options.output, this.$.env.paths.packageDir)
        };

        if ('packagerOptions' in settings) {
            const { packagerOptions } = settings;

            ['windows', 'linux', 'osx'].forEach((system) => {
                if (
                    this.$.env.os[`is${system[0].toUpperCase()}${system.substring(1)}`] &&
                    (`_${system}`) in packagerOptions
                ) {
                    assignIn(packagerOptions, packagerOptions[`_${system}`]);
                }
            });

            Object.keys(packagerOptions).forEach((field) => {
                if (packagerOptions[field] === '@version') {
                    packagerOptions[field] = settings.version;
                }
            });

            assignIn(args, packagerOptions);
        }

        // Move node_modules away. We do not want to delete it, just temporarily remove it from
        // our way.
        fs.renameSync(
            this.$.env.paths.electronApp.nodeModules,
            this.$.env.paths.electronApp.tmpNodeModules
        );

        let extracted = false;

        if (this.$.utils.exists(this.$.env.paths.electronApp.extractedNodeModules)) {
            fs.renameSync(
                this.$.env.paths.electronApp.extractedNodeModules,
                this.$.env.paths.electronApp.nodeModules
            );
            extracted = true;

        }


        try {
            await this.runPackager(args);
        } finally {

            if (extracted) {
                shell.rm('-rf', this.$.env.paths.electronApp.extractedNodeModules);
                shell.rm('-rf', this.$.env.paths.electronApp.nodeModules);
            }
            // Move node_modules back.
            fs.renameSync(
                this.$.env.paths.electronApp.tmpNodeModules,
                this.$.env.paths.electronApp.nodeModules
            );

        }
    }
}
