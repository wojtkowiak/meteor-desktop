import assignIn from 'lodash/assignIn';
import path from 'path';
import fs from 'fs';
import shell from 'shelljs';
import spawn from 'cross-spawn';
import packager from 'electron-packager';

import Log from './log';

const { join } = path;

export default class Electron {

    constructor($) {
        this.log = new Log('electron');
        this.$ = $;
    }

    getElectronPath() {
        return path.join(
            this.$.env.paths.meteorApp.root, 'node_modules', '.bin', 'electron');
    }

    run() {
        // Until: https://github.com/electron-userland/electron-prebuilt/pull/118
        const env = process.env;
        env.ELECTRON_ENV = 'development';

        const child = spawn(this.getElectronPath(), ['app/index.js'], {
            cwd: this.$.env.paths.electronApp.root,
            env
            /*stdio: [process.stdin, process.stdout, process.stderr]*/
        }).on('exit', () => {
        });
        child.stdout.on('data', (chunk) => {
            process.stdout.write(chunk);
        });
    }

    runPackager(args) {
        return new Promise((resolve, reject) => {
            packager(args, (err, appPath) => {
                if (err) {
                    reject(err);
                } else {
                    this.log.info(`wrote packaged app to ${this.$.env.paths.packageDir}`);

                    appPath.forEach(builtAppPath => {
                        const appPathParsed = path.parse(builtAppPath);
                        shell.rm(
                            '-rf',
                            path.join(
                                this.$.env.paths.packageDir,
                                appPathParsed.base,
                                'resources', 'app', 'node_modules')
                        );
                    });
                    resolve();
                }
            });
        });
    }

    async packageApp() {
        const version = JSON.parse(fs.readFileSync(
            join(
                this.$.env.paths.meteorApp.root,
                'node_modules',
                'electron-prebuilt',
                'package.json'
            ), 'UTF-8')
        ).version;

        const settings = this.$.desktop.getSettings();
        const name = settings.name;

        this.log.info(
            `packaging '${name}' for platform '${this.$.env.sys.platform}-${this.$.env.sys.arch}'` +
            ` using electron v${version}`
        );

        shell.rm('-rf', this.$.env.paths.packageDir);

        const args = {
            name,
            version,
            arch: 'all',
            platform: this.$.env.sys.platform,
            dir: this.$.env.paths.electronApp.root,
            out: this.$.env.paths.packageDir
        };

        if ('packagerOptions' in settings) {
            const packagerOptions = settings.packagerOptions;

            ['windows', 'linux', 'osx'].forEach(system => {
                if (
                    this.$.env.os[`is${system[0].toUpperCase()}${system.substring(1)}`] &&
                    (`_${system}`) in packagerOptions
                ) {
                    assignIn(packagerOptions, packagerOptions[`_${system}`]);
                }
            });

            if (packagerOptions.icon) {
                packagerOptions.icon = join(this.$.env.paths.desktop.assets, packagerOptions.icon);
            }

            if ('version-string' in packagerOptions) {
                Object.keys(packagerOptions['version-string']).forEach(field => {
                    if (packagerOptions['version-string'][field] === '@version') {
                        packagerOptions['version-string'][field] = settings.version;
                    }
                });
            }

            console.log(packagerOptions);
            assignIn(args, packagerOptions);
        }

        //console.log(args);
        await this.runPackager(args);
    }
}
