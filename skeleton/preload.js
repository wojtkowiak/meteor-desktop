// This is a modified version of
// https://github.com/electron-webapps/meteor-electron/blob/master/app/preload.js

/**
 The MIT License (MIT)

 Copyright (c) 2015 Michael Risse

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */

/**
 * Since we've disabled Node integration in the Browser window, we must selectively expose
 * main-process/Node modules via this script.
 *
 * @WARNING This file must take care not to leak the imported modules to the Browser window!
 * See https://github.com/atom/electron/issues/1753#issuecomment-104719851.
 */
const _ = require('lodash');
const ipc = require('electron').ipcRenderer;

let devtron = null;
try {
    devtron = require('devtron'); // eslint-disable-line global-require

    window.__devtron = { require, process }; // eslint-disable-line no-underscore-dangle
} catch (e) {
    // If that fails, then probably this is production build and devtron is not available.
}

/**
 * Callback passed to ipc on/once methods.
 *
 * @callback ipcListener
 * @param {string} event - event name
 * @param {...*=}  args  - event's arguments
 */

const Desktop = new (class {

    constructor() {
        this.devtron = devtron;
        this.onceEventListeners = {};
        this.eventListeners = {};
        this.registeredInIpc = {};
    }
    /**
     * Adds a callback to internal listeners placeholders and registers real ipc hooks.
     *
     * @param {string}      module   - module name
     * @param {string}      event    - the name of an event
     * @param {ipcListener} callback - callback to fire when event arrives
     * @param {boolean}     once     - whether this should be fired only once
     */
    addToListeners(module, event, callback, once) {
        let listeners = 'eventListeners';
        if (once) {
            listeners = 'onceEventListeners';
        }
        const eventName = this.getEventName(module, event);
        if (eventName in this[listeners]) {
            this[listeners][eventName].push(callback);
        } else {
            this[listeners][eventName] = [callback];
        }
        if (!(eventName in this.registeredInIpc)) {
            this.registeredInIpc[eventName] = true;
            ipc.on(eventName, (...args) => {
                if (eventName in this.eventListeners) {
                    _.invokeMap(this.eventListeners[eventName], 'apply', undefined, args);
                }
                if (eventName in this.onceEventListeners) {
                    _.invokeMap(this.onceEventListeners[eventName], 'apply', undefined, args);
                }
                this.onceEventListeners[eventName] = [];
            });
        }
    }

    /**
     * Invokes callback when the specified IPC event is fired.
     *
     * @param {string} module        - module name
     * @param {string} event         - the name of an event
     * @param {ipcListener} callback - function to invoke when `event` is triggered
     */
    on(module, event, callback) {
        this.addToListeners(module, event, callback);
    }

    /**
     * Invokes a callback once when the specified IPC event is fired.
     *
     * @param {string} module        - module name
     * @param {string} event         - the name of an event
     * @param {ipcListener} callback - function to invoke when `event` is triggered
     */
    once(module, event, callback) {
        this.addToListeners(module, event, callback, true);
    }

    /**
     * Unregisters a callback.
     *
     * @param {string} module     - module name
     * @param {string} event      - the name of an event
     * @param {function} callback - listener to unregister
     */
    removeListener(module, event, callback) {
        const eventName = this.getEventName(module, event);
        ['eventListeners', 'onceEventListeners'].forEach((listeners) => {
            if (eventName in this[listeners]) {
                if (~this[listeners][eventName].indexOf(callback)) {
                    this[listeners][eventName].splice(
                        this[listeners][eventName].indexOf(callback), 1);
                }
            }
        });
    }

    /**
     * Unregisters all callbacks.
     *
     * @param {string} module - module name
     * @param {string} event  - the name of an event
     */
    removeAllListeners(module, event) {
        const eventName = this.getEventName(module, event);
        this.onceEventListeners[eventName] = [];
        this.eventListeners[eventName] = [];
    }

    /**
     * Send an event to the main Electron process.
     *
     * @param {String} module - module name
     * @param {String} event  - the name of an event
     * @param {...*} args     - additional arguments to pass to event handler
     */
    send(module, event, ...args) {
        const eventName = this.getEventName(module, event);
        ipc.send(eventName, ...args);
    }

    /**
     * Send an global event to the main Electron process.
     *
     * @param {...*} args - arguments to the ipc.send(event, arg1, arg2)
     */
    sendGlobal(...args) { // eslint-disable-line
        ipc.send(...args);
    }

    getEventName(module, event) { // eslint-disable-line
        return `${module}__${event}`;
    }
})();

/**
 * @global
 */
global.Desktop = Desktop;
