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
 * In particular, do not save the following variables as properties of `ElectronImplementation`.
 * See https://github.com/atom/electron/issues/1753#issuecomment-104719851.
 */
var _ = require('lodash');
var ipc = require('electron').ipcRenderer;

/**
 * Defines methods with which to extend the `Electron` module defined in `client.js`.
 * This must be a global in order to escape the preload script and be available to `client.js`.
 * @global
 */
Electron = {
    /**
     * Invokes _callback_ when the specified IPC event is fired.
     *
     * @param {String} module - Module name.
     * @param {String} event - The name of an event.
     * @param {Function} callback - A function to invoke when `event` is triggered. Called with
     *   the signature (event, ...args) - see http://electron.atom.io/docs/v0.37.2/api/ipc-renderer/#sending-messages
     */
    on: function on(module, event, callback) {
        var self = this;
        var eventName = module + '__' + event;
        if (eventName in this._eventListeners) {
            this._eventListeners[eventName].push(callback);
        } else {
            this._eventListeners[eventName] = [callback];
            ipc.on(eventName, function ipcOn(/* event, ...args */) {
                _.invokeMap(self._eventListeners[eventName], 'apply', null, arguments);
            });
        }
    },

    _eventListeners: {},

    /**
     * Send an event to the main Electron process.
     *
     * @param {String} module - Module name.
     * @param {String} event - The name of an event.
     * @param {...*} arg - additional arguments to pass to event handler.
     */
    send: function send(/* event , ...args */) {
        var args = Array.prototype.slice.call(arguments);
        var module = args.shift();
        args[0] = module + '__' + args[0];
        ipc.send.apply(null, args);
    },

    getEventName: function getEventName(module, event) {
        return module + '__' + event;
    }
};
