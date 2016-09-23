import fs from 'fs';
import Log from './log';
import shell from 'shelljs';
import path from 'path';
const { join } = path;
import del from 'del';

/**
 * Represents the .desktop dir scaffold.
 */
export default class ElectronAppScaffold {

    /**
     * @param {Object} $ - Context.
     * @constructor
     */
    constructor($) {
        this.log = new Log('electronAppScaffold');
        this.$ = $;

        this.packageJson = {
            name: 'MeteorDesktop',
            main: 'app.asar/index.js',
            dependencies: {
                connect: '3.5.0',
                'serve-static': '1.11.1',
                'server-destroy': '1.0.1',
                'connect-modrewrite': '0.9.0',
                winston: '2.2.0',
                'find-port': '2.0.1',
                rimraf: '2.5.4',
                shelljs: '0.7.4',
                lodash: '4.15.0',
                request: '2.75.0',
                queue: '4.0.0',
                reify: '0.3.8'
            }
        };

        if (!this.$.env.options.production) {
            this.packageJson.dependencies.devtron = '1.3.0';
            this.packageJson.dependencies['electron-debug'] = '0.6.0';
        }
    }

    getDefaultPackageJson() {
        return this.packageJson;
    }

    clear() {
        if (!this.$.exists(this.$.env.paths.electronApp.root)) {
            this.log.info(`creating ${this.$.env.paths.electronApp.rootName}`);
            shell.mkdir(this.$.env.paths.electronApp.root);
        }

        return del([
            `${this.$.env.paths.electronApp.root}${path.sep}*`,
            `!${this.$.env.paths.electronApp.nodeModules}`
        ]);
    }

    async make() {
        await this.clear();

        if (!this.$.exists(this.$.env.paths.electronApp.skeleton)) {
            shell.mkdir(this.$.env.paths.electronApp.skeleton);
        }

        this.log.debug('copying skeleton');
        shell.cp(
            '-rf',
            join(__dirname, '..', 'skeleton', '*'),
            this.$.env.paths.electronApp.root + path.sep
        );

        this.log.debug('creating .gitignore');
        fs.writeFileSync(this.$.env.paths.electronApp.gitIgnore, [
            'node_modules'
        ].join('\n'));

        fs.writeFileSync(
            this.$.env.paths.electronApp.packageJson, JSON.stringify(this.packageJson, null, 2)
        );
    }
}
