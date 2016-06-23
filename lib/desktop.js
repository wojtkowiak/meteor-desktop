import Log from './log';
import shell from 'shelljs';
import fs from 'fs';
import path from 'path';
import extfs from 'extfs';

/**
 * Represents the .desktop dir.
 */
export default class Desktop {

    /**
     * @param {Object} $ - Context.
     *
     * @constructor
     */
    constructor($) {
        this.log = new Log('desktopScaffold');
        this.$ = $;
        this.settings = null;
    }

    /**
     * Tries to read and returns the settings.json from .desktop dir.
     *
     * @returns {Object|null}
     */
    getSettings() {
        if (!this.settings) {
            try {
                this.settings = JSON.parse(
                    fs.readFileSync(this.$.env.paths.desktop.settings, 'UTF-8')
                );
            } catch (e) {
                this.log.error('error while trying to read \'.desktop/settings.json\': ', e);
                process.exit(1);
            }
        }
        return this.settings;
    }

    /**
     * Tries to read a module.json file from module at provided path.
     *
     * @param {string} modulePath - Path to the module dir.
     * @returns {Object}
     */
    getModuleConfig(modulePath) {
        let moduleConfig = {};
        try {
            moduleConfig = JSON.parse(
                fs.readFileSync(path.join(modulePath, 'module.json'), 'UTF-8')
            );
        } catch (e) {
            this.log.error(
                `error while trying to read 'module.json' from '${modulePath}' module: `,
                e
            );
            process.exit(1);
        }
        if (!('name' in moduleConfig)) {
            this.log.error(`no 'name' field defined in 'module.json' in '${modulePath}' module.`);
            process.exit(1);
        }
        return moduleConfig;
    }

    /**
     * Summarizes all dependencies defined in .desktop.
     *
     * @returns {{fromSettings: {}, plugins: {}, modules: {}}}
     */
    getDependencies() {
        const dependencies = {
            fromSettings: {},
            plugins: {},
            modules: {}
        };
        const settings = this.getSettings();

        // Settings can have a 'dependencies' field.
        if ('dependencies' in settings) {
            dependencies.fromSettings = settings.dependencies;
        }

        // Plugins are also a npm packages.
        if ('plugins' in settings) {
            dependencies.plugins = Object.keys(settings.plugins).reduce((plugins, plugin) => {
                /* eslint-disable no-param-reassign */
                plugins[plugin] = settings.plugins[plugin].version;
                return plugins;
            }, {});
        }

        // Each module can have its own dependencies defined.
        const moduleDependencies = {};
        if (!extfs.isEmptySync(this.$.env.paths.desktop.modules)) {
            shell.ls('-d', path.join(this.$.env.paths.desktop.modules, '*')).forEach(
                module => {
                    if (fs.lstatSync(module).isDirectory()) {
                        const moduleConfig = this.getModuleConfig(module);
                        if (!('dependencies' in moduleConfig)) {
                            moduleConfig.dependencies = {};
                        }
                        if (moduleConfig.name in moduleDependencies) {
                            this.log.error(`duplicate name in 'module.json' in '${module}' - ` +
                            'another module already registered the same name.');
                            process.exit(1);
                        }
                        moduleDependencies[moduleConfig.name] = moduleConfig.dependencies;
                    }
                }
            );
        }

        dependencies.modules = moduleDependencies;
        return dependencies;
    }

    /**
     * Copies the .desktop scaffold into the meteor app dir.
     */
    scaffold() {
        this.log.info('creating .desktop scaffold in your project');
        if (this.$.exists(this.$.env.paths.desktop.root)) {
            this.log.warn('.desktop already exists - delete it if you want a new one to be ' +
                'created');
            return;
        }
        shell.cp('-r', this.$.env.paths.scaffold, this.$.env.paths.desktop.root);
        shell.mkdir(this.$.env.paths.desktop.modules);
        shell.mkdir(this.$.env.paths.desktop.import);
        this.log.info('.desktop directory prepared');
    }

    /**
     * Verifies if all mandatory files are present.
     * @returns {boolean}
     */
    check() {
        return !!(this.$.exists(this.$.env.paths.desktop.root) &&
        this.$.exists(this.$.env.paths.desktop.settings) &&
        this.$.exists(this.$.env.paths.desktop.desktop));
    }
}
