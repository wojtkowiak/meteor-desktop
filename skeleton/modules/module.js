import electron from 'electron';

const { ipcMain } = electron;

// Place to store the reference to the renderer process.

let renderer = null;

/**
 * Simple abstraction over electron's IPC. Ensures modules will not conflict with each other by
 * providing events namespace. It is also a security layer as it is the only communication channel
 * between your app and node environment.
 * @module Module
 * @class
 */
export default class Module {
    /**
     * @constructor
     * @param {string} name - module name
     */
    constructor(name) {
        if (!name || name.trim() === '') {
            throw new Error('module name can not be empty');
        }
        this.name = name;
        this.fetchCallCounter = 0;
        this.fetchTimeoutTimers = {};
        this.fetchTimeout = 2000;
    }

    /**
     * Sends an IPC event with data.
     *
     * @param {string} event - event name
     * @param {...*=}  data  - data to send with the event
     * @public
     */
    send(event, ...data) {
        Module.sendInternal(this.getEventName(event), ...data);
    }

    /**
     * Fetches some data from renderer process by sending an IPC event and waiting for a response.
     * Returns a promise that resolves when the response is received.
     *
     * @param {string} event   - name of an event
     * @param {number} timeout - how long to wait for the response in milliseconds
     * @param {...*} args      - arguments to send with the event
     * @returns {Promise}
     * @public
     */
    fetch(event, timeout = this.fetchTimeout, ...args) {
        const eventName = this.getEventName(event);
        if (this.fetchCallCounter === Number.MAX_SAFE_INTEGER) {
            this.fetchCallCounter = 0;
        }
        this.fetchCallCounter += 1;
        const fetchId = this.fetchCallCounter;

        return new Promise((resolve, reject) => {
            this.once(`${event}_${fetchId}`,
                (responseEvent, id, ...responseArgs) => {
                    if (id === fetchId) {
                        clearTimeout(this.fetchTimeoutTimers[fetchId]);
                        delete this.fetchTimeoutTimers[fetchId];
                        resolve(...responseArgs);
                    }
                }, true);
            this.fetchTimeoutTimers[fetchId] = setTimeout(() => {
                reject('timeout');
            }, timeout);
            Module.sendInternal(eventName, fetchId, ...args);
        });
    }

    /**
     * Module.fetch without the need to provide a timeout value.
     *
     * @param {string} event   - name of an event
     * @param {...*} args      - arguments to send with the event
     * @returns {Promise}
     * @public
     */
    call(event, ...args) {
        return this.fetch(event, this.fetchTimeout, ...args);
    }

    /**
     * Sets the default fetch timeout.
     * @param {number} timeout
     */
    setDefaultFetchTimeout(timeout = this.fetchTimeout) {
        if (typeof timeout !== 'number') {
            throw new Error('timeout must a number');
        }
        this.fetchTimeout = timeout;
    }


    /**
     * Sends and IPC event response for a provided fetch id.
     *
     * @param {string} event   - event name
     * @param {number} fetchId - fetch id that came with then event you are
     *                           responding to
     * @param {...*=}  data    - data to send with the event
     * @public
     */
    respond(event, fetchId, ...data) {
        Module.sendInternal(this.getResponseEventName(`${event}_${fetchId}`), fetchId, ...data);
    }

    /**
     * Registers a callback to a IPC event.
     *
     * @param {string}   event    - event name
     * @param {function} callback - callback to fire
     * @public
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
     * @param {string}   module   - module name
     * @param {string}   event    - name of an event
     * @param {function} callback - listener to unregister
     * @public
     */
    removeListener(module, event, callback) {
        ipcMain.removeListener(this.getEventName(event), callback);
    }

    /**
     * Unregisters all callbacks.
     *
     * @param {string} module - module name
     * @param {string} event  - name of an event
     * @public
     */
    removeAllListeners(module, event) {
        ipcMain.removeAllListeners(this.getEventName(event));
    }

    /**
     * Registers a once fired callback to a IPC event.
     *
     * @param {string}   event    - event name
     * @param {function} callback - callback to fire
     * @param {boolean}  response - whether we are listening for fetch response
     * @public
     */
    once(event, callback, response) {
        const eventName = response ? this.getResponseEventName(event) : this.getEventName(event);
        ipcMain.once(eventName, (receivedEvent, ...args) => {
            renderer = receivedEvent.sender;
            callback(receivedEvent, ...args);
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

    /**
     * Sends a plain IPC event without namespacing it.
     *
     * @param {string} event - event name
     * @param {...*=}  data  - data to send with the event
     * @public
     */
    static sendGlobal(event, ...data) {
        Module.sendInternal(event, ...data);
    }
}

module.exports = Module;
