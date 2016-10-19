import moduleJson from './module.json';

/**
 * Example module.
 *
 * @param {Object} log              - Winston logger
 * @param {Object} app              - reference to the Electron app
 * @param {Object} appSettings      - settings.json object
 * @param {Object} eventsBus        - event emitter for listening or emitting events on the desktop
 *                                    side
 * @param {Object} modules          - reference to all loaded modules
 * @param {Object} settings         - module settings
 * @param {Object} Module           - reference to Module class
 * @constructor
 */
export default class Example {
    constructor(log, app, appSettings, eventsBus, modules, settings, Module) {
        const exampleModule = new Module(moduleJson.name);

        // Get the automatically predefined logger instance.
        this.log = log.loggers.get(moduleJson.name);

        // Never do time consuming or blocking things directly in the constructor.
        // Instead hook to `afterLoading` or `beforeDesktopLoad` events.
        // This will also ensure plugins providing things like splash screens will be able
        // to start as quickly as possible.
        eventsBus.on('afterLoading', () => {
            this.init();
        });
    }

    init() {
    }
}
