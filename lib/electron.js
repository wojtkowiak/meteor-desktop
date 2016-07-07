import assignIn from 'lodash/assignIn';
import path from 'path';
import fs from 'fs';
const { join } = path;
import shell from 'shelljs';
import spawn from 'cross-spawn';
import Log from './log';
import packager from 'electron-packager';

export default class Electron {

    constructor($) {
        this.log = new Log('electron');
        this.$ = $;
    }

    getElectronPath() {
        let electronPath = path.join(
            this.$.env.paths.meteorApp.root, 'node_modules', '.bin', 'electron');
        return electronPath;
    }

    run() {
        // Until: https://github.com/electron-userland/electron-prebuilt/pull/118
        const env = process.env;
        env.ELECTRON_ENV = 'development';

        const child = spawn(this.getElectronPath(), ['app.asar'], {
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
                    const appPathParsed = path.parse(appPath[0]);

                    shell.rm(
                        '-rf',
                        path.join(
                            this.$.env.paths.packageDir,
                            appPathParsed.base,
                            'resources', 'app', 'node_modules')
                    );
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
            arch: this.$.env.sys.arch,
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
                packagerOptions.icon = join(this.$.env.paths.electronApp.assets, packagerOptions.icon);
            }

            //console.log(packagerOptions);
            assignIn(args, packagerOptions);
        }

        //console.log(args);
        await this.runPackager(args);
    }
}
