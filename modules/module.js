var ipcMain = require('electron').ipcMain;

var globals = {
    // Place to store the reference to the renderer process.
    renderer: null
};

/**
 * Simple abstraction over electron's IPC. Ensures modules will not conflict with each other by
 * providing events namespace. It is also a security layer as it is the only communication channel
 * between your app and node environment.
 *
 * @param {string} name - Name of the module.
 * @constructor
 */
function Module(name) {
    this._name = name;
    this._eventsCallbacks = {};
}

/**
 * Sends an IPC event.
 *
 * @param {string} event - Event name.
 * @param {*=}     data  - Data to send.
 */
Module.prototype._send = function send(event, data) {
    if (!globals.renderer) throw new Error('No reference to renderer process (meteor) yet.');
    globals.renderer.send(event, data);
};

/**
 * Sends an general IPC event with data.
 *
 * @param {string} event - Event name.
 * @param {*=}     data  - Data to send.
 */
Module.prototype.sendGlobalEvent = function sendGlobalEvent(event, data) {
    this._send(event, data);
};

/**
 * Sends and IPC event with data.
 *
 * @param {string} event - Event name.
 * @param {*=}     data  - Data to send.
 */
Module.prototype.send = function send(event, data) {
    this._send(this._getEventName(event), data);
};

/**
 * Registers a callback to a IPC event.
 *
 * @param {string}   event    - Event name.
 * @param {function} callback - Callback to fire.
 */
Module.prototype.on = function on(event, callback) {
    ipcMain.on(this._getEventName(event), function onEvent(receivedEvent, args) {
        globals.renderer = receivedEvent.sender;
        callback(receivedEvent, args);
    });
};

/**
 * Registers a callback to a IPC event.
 *
 * @param {string}   event    - Event name.
 * @param {function} callback - Callback to fire.
 */
Module.prototype.on = function on(event, callback) {
    ipcMain.on(this._getEventName(event), function onEvent(receivedEvent, args) {
        globals.renderer = receivedEvent.sender;
        callback(receivedEvent, args);
    });
};


/**
 * Concatenates module name with event name.
 *
 * @param {string} event - Event name.
 * @returns {string}
 * @private
 */
Module.prototype._getEventName = function _getEventName(event) {
    return this._name + '__' + event;
};

module.exports = Module;
