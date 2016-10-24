import shell from 'shelljs';
import fs from 'fs';
import path from 'path';
import hash from 'hash-files';

import Log from './log';

shell.config.fatal = true;

/**
 * Checks if the path is empty.
 * @param {string} searchPath
 * @returns {boolean}
 */
function isEmptySync(searchPath) {
    let stat;
    try {
        stat = fs.statSync(searchPath);
    } catch (e) {
        return true;
    }
    if (stat.isDirectory()) {
        const items = fs.readdirSync(searchPath);
        return !items || !items.length;
    }
    return false;
}

/**
 * Represents the .desktop directory.
 * @class
 * @property {desktopSettings} settings
 */
export default class Desktop {

    /**
     * @param {MeteorDesktop} $ - context
     *
     * @constructor
     */
    constructor($) {
        this.$ = $;
        this.log = new Log('desktop');
        this.settings = null;
    }

    /**
     * Tries to read and returns settings.json contents from .desktop dir.
     *
     * @returns {desktopSettings|null}
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
     * Returns a version hash representing current .desktop contents.
     * @returns {string}
     */
    getHashVersion() {
        this.log.info('calculating hash version from .desktop contents');
        return hash.sync({
            files: [`${this.$.env.paths.desktop.root}${path.sep}**`]
        });
    }

    /**
     * Tries to read a module.json file from a module at provided path.
     *
     * @param {string} modulePath - path to the module dir
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
     * Scans all modules for module.json and gathers this configuration altogether.
     *
     * @returns {[]}
     */
    gatherModuleConfigs() {
        const configs = [];

        if (!isEmptySync(this.$.env.paths.desktop.modules)) {
            shell.ls('-d', path.join(this.$.env.paths.desktop.modules, '*')).forEach(
                (module) => {
                    if (fs.lstatSync(module).isDirectory()) {
                        const moduleConfig = this.getModuleConfig(module);
                        moduleConfig.dirName = path.parse(module).name;
                        configs.push(moduleConfig);
                    }
                }
            );
        }
        return configs;
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
        /** @type {desktopSettings} **/
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
        const configs = this.gatherModuleConfigs();

        configs.forEach(
            (moduleConfig) => {
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
        );

        dependencies.modules = moduleDependencies;
        return dependencies;
    }

    /**
     * Copies the .desktop scaffold into the meteor app dir.
     * Adds entry to .meteor/.gitignore.
     */
    scaffold() {
        this.log.info('creating .desktop scaffold in your project');

        if (this.$.utils.exists(this.$.env.paths.desktop.root)) {
            this.log.warn('.desktop already exists - delete it if you want a new one to be ' +
                'created');
            return;
        }

        shell.cp('-r', this.$.env.paths.scaffold, this.$.env.paths.desktop.root);
        shell.mkdir(this.$.env.paths.desktop.import);
        this.log.info('.desktop directory prepared');
    }

    /**
     * Verifies if all mandatory files are present in the .desktop.
     *
     * @returns {boolean}
     */
    check() {
        this.log.verbose('checking .desktop existence');
        return !!(this.$.utils.exists(this.$.env.paths.desktop.root) &&
            this.$.utils.exists(this.$.env.paths.desktop.settings) &&
            this.$.utils.exists(this.$.env.paths.desktop.desktop));
    }
}

/**
 * @typedef {Object} desktopSettings
 * @property {string} name
 * @property {string} projectName
 * @property {boolean} devTools
 * @property {boolean} devtron
 * @property {boolean} desktopHCP
 * @property {string} autoUpdateFeedUrl
 * @property {Object} autoUpdateFeedHeaders
 * @property {Object} autoUpdateManualCheck
 * @property {Object} desktopHCPSettings
 * @property {boolean} desktopHCPSettings.ignoreCompatibilityVersion
 * @property {boolean} desktopHCPSettings.blockAppUpdateOnDesktopIncompatibility
 * @property {number} webAppStartupTimeout
 * @property {Object} window
 * @property {Object} windowDev
 * @property {Object} packageJsonFields
 * @property {Object} builderOptions
 * @property {Object} packagerOptions
 * @property {Object} plugins
 * @property {Object} dependencies
 * @property {boolean} uglify
 * @property {string} version
 **/
