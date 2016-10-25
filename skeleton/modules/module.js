import electron from 'electron';

const { ipcMain } = electron;

// Place to store the reference to the renderer process.
let renderer = null;

/**
 * Simple abstraction over electron's IPC. Ensures modules will not conflict with each other by
 * providing events namespace. It is also a security layer as it is the only communication channel
 * between your app and node environment.
 *
 * @param {string} name - name of the module
 * @class
 */
export default class Module {

    constructor(name) {
        this.name = name;
    }

    /**
     * Sends an general IPC event with data.
     *
     * @param {string} event - event name
     * @param {...*=}  data  - data to send
     */
    static sendGlobalEvent(event, ...data) {
        Module.sendInternal(event, ...data);
    }

    /**
     * Sends and IPC event with data.
     *
     * @param {string} event - event name
     * @param {...*=}  data  - data to send
     */
    send(event, ...data) {
        Module.sendInternal(this.getEventName(event), ...data);
    }

    /**
     * Sends and IPC event response for a provided fetch id.
     *
     * @param {string} event   - event name
     * @param {number} fetchId - fetch id that came with then event you are
     *                           responding to
     * @param {...*=}  data    - data to send
     */
    respond(event, fetchId, ...data) {
        Module.sendInternal(this.getResponseEventName(event), fetchId, ...data);
    }

    /**
     * Registers a callback to a IPC event.
     *
     * @param {string}   event    - event name
     * @param {function} callback - callback to fire
     */
    on(event, callback) {
        ipcMain.on(this.getEventName(event), (receivedEvent, ...args) => {
            renderer = receivedEvent.sender;
            callback(receivedEvent, ...args);
        });
    }

    /**
     * Unregisters a callback.
     *
     * @param {string} module     - module name
     * @param {string} event      - the name of an event
     * @param {function} callback - listener to unregister
     */
    removeListener(module, event, callback) {
        ipcMain.removeListener(this.getEventName(event), callback);
    }

    /**
     * Unregisters all callbacks.
     *
     * @param {string} module - module name
     * @param {string} event  - the name of an event
     */
    removeAllListeners(module, event) {
        ipcMain.removeAllListeners(this.getEventName(event));
    }

    /**
     * Registers a once fired callback to a IPC event.
     *
     * @param {string}   event    - event name
     * @param {function} callback - callback to fire
     */
    once(event, callback) {
        ipcMain.once(this.getEventName(event), (receivedEvent, args) => {
            renderer = receivedEvent.sender;
            callback(receivedEvent, args);
        });
    }

    /**
     * Concatenates module name with event name.
     *
     * @param {string} event - event name
     * @returns {string}
     * @private
     */
    getEventName(event) {
        return `${this.name}__${event}`;
    }

    /**
     * Concatenates event name with response postfix.
     *
     * @param {string} event - event name
     * @returns {string}
     * @private
     */
    getResponseEventName(event) {
        return `${this.getEventName(event)}___response`;
    }

    /**
     * Sends an IPC event.
     *
     * @param {string} event - event name
     * @param {*=}     data  - data to send
     * @private
     */
    static sendInternal(event, ...data) {
        if (!renderer) throw new Error('No reference to renderer process (meteor) yet.');
        // During the HCP update the window might have been already destroyed.
        if (!renderer.isDestroyed()) {
            renderer.send(event, ...data);
        }
    }
}

module.exports = Module;
