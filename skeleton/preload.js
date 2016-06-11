// TODO: we have a Chrome 51 in Electron now - this must be rewritten to ES6!

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
var _ = require('lodash');
var ipc = require('electron').ipcRenderer;

/**
 * Callback passed to ipc on/once methods.
 *
 * @callback ipcListener
 * @param {string} event - Event name.
 * @param {...*=}  args  - Event's arguments.
 */


var Desktop = {

    onceEventListeners: {},
    eventListeners: {},
    registeredInIpc: {},

    /**
     * Adds a callback to internal listeners placeholders and registers real ipc hooks.
     *
     * @param {string}      module   - Module name.
     * @param {string}      event    - The name of an event.
     * @param {ipcListener} callback - Callback to fire when event arrives.
     * @param {boolean}     once     - Whether this should be fired only once.
     */
    addToListeners: function addToListeners(module, event, callback, once) {
        var self = this;
        let listeners = 'eventListeners';
        if (once) {
            listeners = 'onceEventListeners';
        }
        var eventName = this.getEventName(module, event);
        if (eventName in this[listeners]) {
            this[listeners][eventName].push(callback);
        } else {
            this[listeners][eventName] = [callback];
        }
        if (!(eventName in this.registeredInIpc)) {
            this.registeredInIpc[eventName] = true;
            ipc.on(eventName, function ipcOn(/* event, ...args */) {
                if (eventName in self.eventListeners) {
                    _.invokeMap(self.eventListeners[eventName], 'apply', undefined, arguments);
                }
                if (eventName in self.onceEventListeners) {
                    _.invokeMap(self.onceEventListeners[eventName], 'apply', undefined, arguments);
                }
                self.onceEventListeners[eventName] = [];
            });
        }
    },

    /**
     * Invokes callback when the specified IPC event is fired.
     *
     * @param {string} module        - Module name.
     * @param {string} event         - The name of an event.
     * @param {ipcListener} callback - A function to invoke when `event` is triggered.
     */
    on: function on(module, event, callback) {
        this.addToListeners(module, event, callback);
    },

    /**
     * Invokes a callback once when the specified IPC event is fired.
     *
     * @param {string} module        - Module name.
     * @param {string} event         - The name of an event.
     * @param {ipcListener} callback - A function to invoke when `event` is triggered.
     */
    once: function once(module, event, callback) {
        this.addToListeners(module, event, callback, true);
    },

    /**
     * Unregisters a callback.
     *
     * @param {string} module     - Module name.
     * @param {string} event      - The name of an event.
     * @param {function} callback - Listener to unregister.
     */
    removeListener: function removeListener(module, event, callback) {
        var i;
        var self = this;
        var eventName = this.getEventName(module, event);
        ['eventListeners', 'onceEventListeners'].forEach(function removeListenerFrom(listeners) {
            if (eventName in self[listeners]) {
                for (i = self[listeners][eventName].length - 1; i >= 0; i--) {
                    if (self[listeners][eventName][i] === callback) {
                        self[listeners][eventName].splice(i, 1);
                    }
                }
            }
        });
    },

    /**
     * Unregisters all callbacks.
     *
     * @param {string} module     - Module name.
     * @param {string} event      - The name of an event.
     */
    removeAllListeners: function removeAllListeners(module, event) {
        var eventName = this.getEventName(module, event);
        this.onceEventListeners[eventName] = [];
        this.eventListeners[eventName] = [];
    },

    /**
     * Send an event to the main Electron process.
     *
     * @param {String} module - Module name.
     * @param {String} event - The name of an event.
     * @param {...*} arg - additional arguments to pass to event handler.
     */
    send: function send(/* module, event , ...args */) {
        var args = Array.prototype.slice.call(arguments);
        var module = args.shift();
        args[0] = this.getEventName(module, args[0]);
        ipc.send.apply(null, args);
    },

    /**
     * Send an global event to the main Electron process.
     *
     * @param {String} event - The name of an event.
     * @param {...*} arg - additional arguments to pass to event handler.
     */
    sendGlobal: function send(/* event , ...args */) {
        var args = Array.prototype.slice.call(arguments);
        ipc.send.apply(ipc, args);
    },

    getEventName: function getEventName(module, event) {
        return module + '__' + event;
    }
};


/**
 * @global
 */
global.Desktop = Desktop;
