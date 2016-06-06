import fs from 'fs';
import Log from './log';
import shell from 'shelljs';
import path from 'path';
const { join } = path;
/**
 * Represents the .desktop dir scaffold.
 */
class ElectronAppScaffold {

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
                'serve-index': '1.7.3',
                'connect-modrewrite': '0.9.0',
                'electron-debug': '0.6.0',
                winston: '2.2.0',
                'find-port': '2.0.1',
                shelljs: '0.7.0',
                lodash: '4.11.1',
                request: '2.72.0',
                axios: '0.11.0',
                queue: '4.0.0'
            }
        };
    }

    getDefaultPackageJson() {
        return this.packageJson;
    }

    make() {
        if (!this.$.exists(this.$.env.paths.electronApp.root)) {
            this.log.info(`creating ${this.$.env.paths.electronApp.rootName}`);
            shell.mkdir(this.$.env.paths.electronApp.root);
        }

        this.log.debug('copying templates');
        shell.cp(
            '-rf',
            join(__dirname, '..', 'templates', '*'),
            this.$.env.paths.electronApp.root + path.sep
        );

        console.log('check ', this.$.env.paths.electronApp.modules);
        if (this.$.exists(this.$.env.paths.electronApp.modules)) {
            console.log('removing');
            shell.rm('-r', this.$.env.paths.electronApp.modules);
        }

        this.log.debug('copying internal modules');
        shell.cp('-rf', join(__dirname, '..', 'modules'), this.$.env.paths.electronApp.root + path.sep);

        this.log.debug('creating .gitignore');
        fs.writeFileSync(this.$.env.paths.electronApp.gitIgnore, [
            '.DS_Store', '.dist', 'app',
            'bin', 'db', 'node_modules'
        ].join('\n'));

        fs.writeFileSync(
            this.$.env.paths.electronApp.packageJson, JSON.stringify(this.packageJson, null, 2)
        );


    }
}


module.exports = ElectronAppScaffold;

