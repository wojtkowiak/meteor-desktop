/**
 * Represents the native desktop side.
 *
 * @param {Object} log          - Winston logger instance
 * @param {Object} app          - reference to the Electron app
 * @param {Object} appSettings  - settings.json object
 * @param {Object} eventsBus    - event emitter for listening or emitting events
 *                                side
 * @param {Object} modules      - reference to all loaded modules
 * @param {Object} Module       - reference to Module class
 * @constructor
 */
export default class Desktop {
    constructor(log, app, appSettings, eventsBus, modules, Module) {
        const desktop = new Module('desktop');
        // Get the automatically predefined logger instance.
        this.log = log.loggers.get('desktop');

        // From Meteor use this by invoking Desktop.send('desktop', 'closeApp');
        desktop.on('closeApp', () => app.quit());
    }
}

