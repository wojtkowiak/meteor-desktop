import Log from './log';
import shell from 'shelljs';
import fs from 'fs';
import path from 'path';
import { assignIn } from 'lodash';
import extfs from 'extfs';

/**
 * Represents the .desktop dir scaffold.
 */
class DesktopScaffold {

    /**
     * @param {Object} $ - Context.
     * @constructor
     */
    constructor($) {
        this.log = new Log('desktopScaffold');
        this.$ = $;
        this.settings = null;
    }

    getSettings() {
        if (!this.settings) {
            this.settings = JSON.parse(fs.readFileSync(this.$.env.paths.desktop.settings, 'UTF-8'));
        }
        return this.settings;
    }

    getDependencies() {
        const dependencies = {
            fromSettings: {},
            plugins: {}
        };
        const settings = JSON.parse(fs.readFileSync(this.$.env.paths.desktop.settings, 'UTF-8'));


        if ('dependencies' in settings) {
            dependencies.fromSettings = settings.dependencies;
        }

        if ('plugins' in settings) {
            dependencies.plugins = Object.keys(settings.plugins).reduce((plugins, plugin) => {
                plugins[plugin] = settings.plugins[plugin].version;
                return plugins;
            }, {});
        }

        const moduleDependencies = {};
        if (!extfs.isEmptySync(this.$.env.paths.desktop.modules)) {
            shell.ls('-d', path.join(this.$.env.paths.desktop.modules, '*')).forEach(
                module => {
                    if (fs.lstatSync(module).isDirectory()) {
                        const moduleConfig = JSON.parse(fs.readFileSync(path.join(module, 'module.json'), 'UTF-8'));
                        if (!('name' in moduleConfig)) {
                            throw new Error(`No 'name' field defined in module.json in ${module}.`);
                        }
                        if (moduleConfig.name in moduleDependencies) {
                            throw new Error(`Duplicate name in module.json in ${module}. Another module registered the same name.`);
                        }
                        moduleDependencies[moduleConfig.name] = moduleConfig.dependencies;
                    }
                }
            );
        }

        dependencies.modules = moduleDependencies;
        return dependencies;
    }

    scaffold() {
        this.log.info('creating .desktop scaffold in your project');
        if (this.$.exists(this.$.env.meteorApp.desktop)) {
            this.log.warn('.desktop already exists - delete it if you want a new one to be ' +
                'created');
            return;
        }
        shell.cp('-r', this.$.env.scaffold, this.$.env.meteorApp.desktop);
        this.log.info('.desktop directory prepared');
    }

    check() {
        return !!(this.$.exists(this.$.env.paths.desktop.root) &&
        this.$.exists(this.$.env.paths.desktop.settings) &&
        this.$.exists(this.$.env.paths.desktop.desktop));
    }
}


module.exports = DesktopScaffold;

