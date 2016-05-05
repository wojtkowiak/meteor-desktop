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
            packager(args, (err, appPath) => {
                if (err) {
                    reject(err);
                } else {
                    this.log.info(`wrote packaged app to ${this.$.env.paths.packageDir}`);

                    const promises = [];
                    appPath.forEach((builtAppPath) => {
                        const appPathParsed = path.parse(builtAppPath);
                        promises.push(this.$.utils.rmWithRetries(
                            '-rf',
                            path.join(
                                this.$.env.paths.packageDir,
                                appPathParsed.base,
                                'resources', 'app', 'node_modules')
                        ));
                    });
                    Promise.all(promises).then(() => {
                        resolve();
                    }).catch((e) => {
                        reject(e);
                    });
                }
            });
        });
    }

    async packageApp() {
        const version = JSON.parse(fs.readFileSync(
            join(
                this.$.env.paths.meteorApp.root,
                'node_modules',
                'electron',
                'package.json'
            ), 'UTF-8')
        ).version;

        const settings = this.$.desktop.getSettings();
        const name = settings.name;
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
                '-rf', path.join(this.$.env.options.output, this.$.env.paths.packageDir));
        } catch (e) {
            throw new Error(e);
        }

        const args = {
            name,
            version,
            arch,
            platform: this.$.env.sys.platform,
            dir: this.$.env.paths.electronApp.root,
            out: path.join(this.$.env.options.output, this.$.env.paths.packageDir)
        };

        if ('packagerOptions' in settings) {
            const packagerOptions = settings.packagerOptions;

            ['windows', 'linux', 'osx'].forEach((system) => {
                if (
                    this.$.env.os[`is${system[0].toUpperCase()}${system.substring(1)}`] &&
                    (`_${system}`) in packagerOptions
                ) {
                    assignIn(packagerOptions, packagerOptions[`_${system}`]);
                }
            });

            if ('version-string' in packagerOptions) {
                Object.keys(packagerOptions['version-string']).forEach((field) => {
                    if (packagerOptions['version-string'][field] === '@version') {
                        packagerOptions['version-string'][field] = settings.version;
                    }
                });
            }
            assignIn(args, packagerOptions);
        }

        // Move node_modules away. We do not want to delete it, just temporarily remove it from
        // our way.
        shell.mv(
            this.$.env.paths.electronApp.nodeModules,
            this.$.env.paths.electronApp.tmpNodeModules
        );

        try {
            await this.runPackager(args);
        } finally {
            // Move node_modules back.
            shell.mv(
                this.$.env.paths.electronApp.tmpNodeModules,
                this.$.env.paths.electronApp.nodeModules
            );
        }
    }
}
