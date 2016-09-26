import fs from 'fs';
import del from 'del';
import shell from 'shelljs';
import path from 'path';

import Log from './log';

const { join } = path;

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

    /**
     * Just a public getter from the default package.json object.
     * @returns {Object}
     */
    getDefaultPackageJson() {
        return this.packageJson;
    }

    /**
     * Clear the electron app. Removes everything except the node_modules which would be a waste
     * to delete. Later `npm prune` will keep it clear.
     */
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

    /**
     * After clearing the electron app path copies a fresh skeleton.
     */
    async make() {
        await this.clear();

        try {
            fs.mkdirSync(this.$.env.paths.electronApp.appRoot);
        } catch (e) {
            if (e.code !== 'EEXIST') {
                this.log.error(
                    `error while creating dir: ${this.$.env.paths.electronApp.appRoot}: ${e}`);
                process.exit(1);
            }
        }

        this.log.debug('copying skeleton');
        shell.cp(
            '-rf',
            join(this.$.env.paths.meteorDesktop.skeleton, '*'),
            this.$.env.paths.electronApp.appRoot + path.sep
        );

        // TODO: hey, wait, .gitignore is not needed - right?
        /*
        this.log.debug('creating .gitignore');
        fs.writeFileSync(this.$.env.paths.electronApp.gitIgnore, [
            'node_modules'
        ].join('\n'));
        */

        fs.writeFileSync(
            this.$.env.paths.electronApp.packageJson, JSON.stringify(this.packageJson, null, 2)
        );
    }
}
