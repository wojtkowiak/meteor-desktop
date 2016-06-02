import Log from './log';
import shell from 'shelljs';
import ElectronAppScaffold from './electronAppScaffold';
import path from 'path';
const { join } = path;
import assignIn from 'lodash/assignIn';
import fs from 'fs';

/**
 * Represents the .desktop dir scaffold.
 */
class ElectronApp {

    /**
     * @param {Object} $ - Context.
     * @constructor
     */
    constructor($) {
        this.log = new Log(this, 'electronApp');
        this.scaffold = new ElectronAppScaffold($);
        this.$ = $;
        this.packageJson = null;
    }


    run() {
        this.log.info('creating electron app');
        this.log.info('scaffolding');
        // TODO: check form .desktop integrity
        this.scaffold.make();
        this.installDesktop();
    }

    installDesktop() {
        this.copyFilesFromDesktop();
        this.updatePackageJsonFields();
        this.updateDependencies();
    }

    updateDependencies() {
        this.packageJson.dependencies = this.$.desktop.mergeDependencies(this.scaffold.getDefaultPackageJson().dependencies);
        fs.writeFileSync(
            this.$.env.paths.electronApp.packageJson, JSON.stringify(this.packageJson, null, 2)
        );
    }

    updatePackageJsonFields() {
        const settings = this.$.desktop.getSettings();
        const packageJson = this.scaffold.getDefaultPackageJson();
        if ('packageJsonFields' in settings) {
            assignIn(packageJson, settings.packageJsonFields);
        }
        fs.writeFileSync(
            this.$.env.paths.electronApp.packageJson, JSON.stringify(packageJson, null, 2)
        );
        this.packageJson = packageJson;
    }

    copyFilesFromDesktop() {
        shell.rm('-rf', this.$.env.paths.electronApp.assets);

        const copy = [
            this.$.env.paths.desktop.modules,
            this.$.env.paths.desktop.assets,
            this.$.env.paths.desktop.index,
            this.$.env.paths.desktop.settings
        ];

        copy.forEach(pathToCopy => {
            shell.cp(
                '-rf',
                pathToCopy,
                this.$.env.paths.electronApp.root + path.sep
            );
        });
    }


}


module.exports = ElectronApp;

