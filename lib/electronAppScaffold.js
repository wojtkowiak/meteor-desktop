import fs from 'fs';
import del from 'del';
import shell from 'shelljs';
import path from 'path';

import Log from './log';
import dependencies from './skeletonDependencies';

const { join } = path;
shell.config.fatal = true;

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
            name: 'MyMeteorApp',
            main: 'app.asar/index.js',
            dependencies
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
     * After clearing the electron app path, copies a fresh skeleton.
     */
    async make() {
        try {
            await this.clear();
        } catch (e) {
            this.log.error(
                `error while removing files from ${this.$.env.paths.electronApp.root}: `, e);
            process.exit(1);
        }

        try {
            fs.mkdirSync(this.$.env.paths.electronApp.appRoot);
        } catch (e) {
            if (e.code !== 'EEXIST') {
                this.log.error(
                    `error while creating dir: ${this.$.env.paths.electronApp.appRoot}: `, e);
                process.exit(1);
            }
        }

        this.log.debug('copying skeleton app');
        try {
            shell.cp(
                '-rf',
                join(this.$.env.paths.meteorDesktop.skeleton, '*'),
                this.$.env.paths.electronApp.appRoot + path.sep
            );
        } catch (e) {
            this.log.error('error while copying skeleton app:', e);
            process.exit(1);
        }

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
