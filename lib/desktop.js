import Log from './log';
import shell from 'shelljs';
import fs from 'fs';
import path from 'path';
import { assignIn } from 'lodash';

/**
 * Represents the .desktop dir scaffold.
 */
class DesktopScaffold {

    /**
     * @param {Object} $ - Context.
     * @constructor
     */
    constructor($) {
        this.log = new Log(this, 'desktopScaffold');
        this.$ = $;
        this.settings = null;
    }

    getSettings() {
        if (!this.settings) {
            this.settings = JSON.parse(fs.readFileSync(this.$.env.paths.desktop.settings, 'UTF-8'));
        }
        return this.settings;
    }



    mergeDependencies() {
        const dependencies = {};
        const settings = JSON.parse(fs.readFileSync(this.$.env.paths.desktop.settings, 'UTF-8'));

        if ('dependencies' in settings) {
            if (this.$.depsValid(module, settings.dependencies)) {
                this.$.checkDuplicatesDeps(module, dependencies, settings.dependencies);
                assignIn(dependencies, settings.dependencies);
            }
        }

        if ('plugins' in settings) {
            const plugins = Object.keys(settings.plugins).reduce((plugins, plugin) => {
                plugins[plugin] = settings.plugins[plugin].version;
                return plugins;
            }, {});

            if (this.$.depsValid(module, settings.dependencies)) {
                this.$.checkDuplicatesDeps(module, dependencies, plugins);
                assignIn(dependencies, plugins);
            }
        }

        shell.ls('-d', path.join(this.$.env.paths.desktop.modules, '*')).forEach(
            module => {
                if (fs.lstatSync(module).isDirectory()) {
                    const moduleConfig = JSON.parse(fs.readFileSync(path.join(module, 'module.json'), 'UTF-8'));
                    if ('dependencies' in moduleConfig) {
                        if (this.$.depsValid(module, moduleConfig.dependencies)) {
                            this.$.checkDuplicatesDeps(module, dependencies, moduleConfig.dependencies);
                            assignIn(dependencies, moduleConfig.dependencies);
                        }
                    }
                }
            }
        );
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
        this.$.exists(this.$.env.paths.desktop.index));
    }
}


module.exports = DesktopScaffold;

