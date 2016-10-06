/**
 * Represents the native desktop side.
 *
 * @param {Object} log          - Winston logger instance
 * @param {Object} app          - reference to the Electron app
 * @param {Object} appSettings  - settings.json object
 * @param {Object} systemEvents - event emitter for listening or emitting events on the desktop
 *                                side
 * @param {Object} modules      - reference to all loaded modules
 * @param {Object} Module       - reference to Module
 * @constructor
 */
class Desktop {
    constructor(log, app, appSettings, systemEvents, modules, Module) {
        const desktop = new Module('desktop');

        // From Meteor use this by invoking Desktop.send('desktop', 'closeApp');
        desktop.on('closeApp', () => app.quit());
    }
}

module.exports = (...args) => new Desktop(...args);
