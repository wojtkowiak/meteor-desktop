import fs from 'fs';
import Log from './log';
import shell from 'shelljs';
import path from 'path';
const { join } = path;
import asar from 'asar';
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
            main: 'index.js',
            dependencies: {
                connect: '3.4.1',
                'serve-static': '1.10.2',
                'server-destroy': '1.0.1',
                'connect-modrewrite': '0.9.0',
                'electron-debug': '0.6.0',
                winston: '2.2.0',
                'find-port': '2.0.1',
                shelljs: '0.7.0',
                lodash: '4.11.1',
                request: '2.72.0',
                queue: '4.0.0',
                reify: '0.2.1'
            }
        };

        if (!this.$.env.options.production) {
            this.packageJson.dependencies.devtron = '1.2.1';
        }
    }

    getDefaultPackageJson() {
        return this.packageJson;
    }

    make() {
        if (!this.$.exists(this.$.env.paths.electronApp.root)) {
            this.log.info(`creating ${this.$.env.paths.electronApp.rootName}`);
            shell.mkdir(this.$.env.paths.electronApp.root);
        }

        if (!this.$.exists(this.$.env.paths.electronApp.skeleton)) {
            shell.mkdir(this.$.env.paths.electronApp.skeleton);
        }

        this.log.debug('copying skeleton');
        shell.cp(
            '-rf',
            join(__dirname, '..', 'skeleton', '*'),
            this.$.env.paths.electronApp.skeleton + path.sep
        );

        /*if (this.$.exists(this.$.env.paths.electronApp.modules)) {
            shell.rm('-r', this.$.env.paths.electronApp.modules);
        }*/

        this.log.debug('copying internal modules');
        shell.cp(
            '-rf',
            join(__dirname, '..', 'modules'),
            this.$.env.paths.electronApp.skeleton + path.sep
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
