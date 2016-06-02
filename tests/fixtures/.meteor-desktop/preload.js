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
            ipc.on(eventName, function ipcOn() /* event, ...args */{
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
    send: function send() /* event , ...args */{
        var args = Array.prototype.slice.call(arguments);
        var module = args.shift();
        args[0] = module + '__' + args[0];
        ipc.send.apply(null, args);
    },

    getEventName: function getEventName(module, event) {
        return module + '__' + event;
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlbXBsYXRlcy9wcmVsb2FkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFrQ0EsSUFBSSxJQUFJLFFBQVEsUUFBUixDQUFSO0FBQ0EsSUFBSSxNQUFNLFFBQVEsVUFBUixFQUFvQixXQUE5Qjs7Ozs7OztBQU9BLFdBQVc7Ozs7Ozs7OztBQVNQLFFBQUksU0FBUyxFQUFULENBQVksTUFBWixFQUFvQixLQUFwQixFQUEyQixRQUEzQixFQUFxQztBQUNyQyxZQUFJLE9BQU8sSUFBWDtBQUNBLFlBQUksWUFBWSxTQUFTLElBQVQsR0FBZ0IsS0FBaEM7QUFDQSxZQUFJLGFBQWEsS0FBSyxlQUF0QixFQUF1QztBQUNuQyxpQkFBSyxlQUFMLENBQXFCLFNBQXJCLEVBQWdDLElBQWhDLENBQXFDLFFBQXJDO0FBQ0gsU0FGRCxNQUVPO0FBQ0gsaUJBQUssZUFBTCxDQUFxQixTQUFyQixJQUFrQyxDQUFDLFFBQUQsQ0FBbEM7QUFDQSxnQkFBSSxFQUFKLENBQU8sU0FBUCxFQUFrQixTQUFTLEtBQVQsRyxvQkFBcUM7QUFDbkQsa0JBQUUsU0FBRixDQUFZLEtBQUssZUFBTCxDQUFxQixTQUFyQixDQUFaLEVBQTZDLE9BQTdDLEVBQXNELElBQXRELEVBQTRELFNBQTVEO0FBQ0gsYUFGRDtBQUdIO0FBQ0osS0FwQk07O0FBc0JQLHFCQUFpQixFQXRCVjs7Ozs7Ozs7O0FBK0JQLFVBQU0sU0FBUyxJQUFULEcscUJBQXFDO0FBQ3ZDLFlBQUksT0FBTyxNQUFNLFNBQU4sQ0FBZ0IsS0FBaEIsQ0FBc0IsSUFBdEIsQ0FBMkIsU0FBM0IsQ0FBWDtBQUNBLFlBQUksU0FBUyxLQUFLLEtBQUwsRUFBYjtBQUNBLGFBQUssQ0FBTCxJQUFVLFNBQVMsSUFBVCxHQUFnQixLQUFLLENBQUwsQ0FBMUI7QUFDQSxZQUFJLElBQUosQ0FBUyxLQUFULENBQWUsSUFBZixFQUFxQixJQUFyQjtBQUNILEtBcENNOztBQXNDUCxrQkFBYyxTQUFTLFlBQVQsQ0FBc0IsTUFBdEIsRUFBOEIsS0FBOUIsRUFBcUM7QUFDL0MsZUFBTyxTQUFTLElBQVQsR0FBZ0IsS0FBdkI7QUFDSDtBQXhDTSxDQUFYIiwiZmlsZSI6InRlbXBsYXRlcy9wcmVsb2FkLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhpcyBpcyBhIG1vZGlmaWVkIHZlcnNpb24gb2ZcclxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2VsZWN0cm9uLXdlYmFwcHMvbWV0ZW9yLWVsZWN0cm9uL2Jsb2IvbWFzdGVyL2FwcC9wcmVsb2FkLmpzXHJcbi8qKlxyXG4gVGhlIE1JVCBMaWNlbnNlIChNSVQpXHJcblxyXG4gQ29weXJpZ2h0IChjKSAyMDE1IE1pY2hhZWwgUmlzc2VcclxuXHJcbiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XHJcbiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXHJcbiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXHJcbiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXHJcbiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcclxuIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XHJcblxyXG4gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXHJcbiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxyXG5cclxuIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcclxuIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxyXG4gRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXHJcbiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXHJcbiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxyXG4gT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcclxuIFNPRlRXQVJFLlxyXG4gKi9cclxuXHJcbi8qKlxyXG4gKiBTaW5jZSB3ZSd2ZSBkaXNhYmxlZCBOb2RlIGludGVncmF0aW9uIGluIHRoZSBCcm93c2VyIHdpbmRvdywgd2UgbXVzdCBzZWxlY3RpdmVseSBleHBvc2VcclxuICogbWFpbi1wcm9jZXNzL05vZGUgbW9kdWxlcyB2aWEgdGhpcyBzY3JpcHQuXHJcbiAqXHJcbiAqIEBXQVJOSU5HIFRoaXMgZmlsZSBtdXN0IHRha2UgY2FyZSBub3QgdG8gbGVhayB0aGUgaW1wb3J0ZWQgbW9kdWxlcyB0byB0aGUgQnJvd3NlciB3aW5kb3chXHJcbiAqIEluIHBhcnRpY3VsYXIsIGRvIG5vdCBzYXZlIHRoZSBmb2xsb3dpbmcgdmFyaWFibGVzIGFzIHByb3BlcnRpZXMgb2YgYEVsZWN0cm9uSW1wbGVtZW50YXRpb25gLlxyXG4gKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2F0b20vZWxlY3Ryb24vaXNzdWVzLzE3NTMjaXNzdWVjb21tZW50LTEwNDcxOTg1MS5cclxuICovXHJcbnZhciBfID0gcmVxdWlyZSgnbG9kYXNoJyk7XHJcbnZhciBpcGMgPSByZXF1aXJlKCdlbGVjdHJvbicpLmlwY1JlbmRlcmVyO1xyXG5cclxuLyoqXHJcbiAqIERlZmluZXMgbWV0aG9kcyB3aXRoIHdoaWNoIHRvIGV4dGVuZCB0aGUgYEVsZWN0cm9uYCBtb2R1bGUgZGVmaW5lZCBpbiBgY2xpZW50LmpzYC5cclxuICogVGhpcyBtdXN0IGJlIGEgZ2xvYmFsIGluIG9yZGVyIHRvIGVzY2FwZSB0aGUgcHJlbG9hZCBzY3JpcHQgYW5kIGJlIGF2YWlsYWJsZSB0byBgY2xpZW50LmpzYC5cclxuICogQGdsb2JhbFxyXG4gKi9cclxuRWxlY3Ryb24gPSB7XHJcbiAgICAvKipcclxuICAgICAqIEludm9rZXMgX2NhbGxiYWNrXyB3aGVuIHRoZSBzcGVjaWZpZWQgSVBDIGV2ZW50IGlzIGZpcmVkLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGUgLSBNb2R1bGUgbmFtZS5cclxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCAtIFRoZSBuYW1lIG9mIGFuIGV2ZW50LlxyXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgLSBBIGZ1bmN0aW9uIHRvIGludm9rZSB3aGVuIGBldmVudGAgaXMgdHJpZ2dlcmVkLiBDYWxsZWQgd2l0aFxyXG4gICAgICogICB0aGUgc2lnbmF0dXJlIChldmVudCwgLi4uYXJncykgLSBzZWUgaHR0cDovL2VsZWN0cm9uLmF0b20uaW8vZG9jcy92MC4zNy4yL2FwaS9pcGMtcmVuZGVyZXIvI3NlbmRpbmctbWVzc2FnZXNcclxuICAgICAqL1xyXG4gICAgb246IGZ1bmN0aW9uIG9uKG1vZHVsZSwgZXZlbnQsIGNhbGxiYWNrKSB7XHJcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgICAgIHZhciBldmVudE5hbWUgPSBtb2R1bGUgKyAnX18nICsgZXZlbnQ7XHJcbiAgICAgICAgaWYgKGV2ZW50TmFtZSBpbiB0aGlzLl9ldmVudExpc3RlbmVycykge1xyXG4gICAgICAgICAgICB0aGlzLl9ldmVudExpc3RlbmVyc1tldmVudE5hbWVdLnB1c2goY2FsbGJhY2spO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuX2V2ZW50TGlzdGVuZXJzW2V2ZW50TmFtZV0gPSBbY2FsbGJhY2tdO1xyXG4gICAgICAgICAgICBpcGMub24oZXZlbnROYW1lLCBmdW5jdGlvbiBpcGNPbigvKiBldmVudCwgLi4uYXJncyAqLykge1xyXG4gICAgICAgICAgICAgICAgXy5pbnZva2VNYXAoc2VsZi5fZXZlbnRMaXN0ZW5lcnNbZXZlbnROYW1lXSwgJ2FwcGx5JywgbnVsbCwgYXJndW1lbnRzKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSxcclxuXHJcbiAgICBfZXZlbnRMaXN0ZW5lcnM6IHt9LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2VuZCBhbiBldmVudCB0byB0aGUgbWFpbiBFbGVjdHJvbiBwcm9jZXNzLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBtb2R1bGUgLSBNb2R1bGUgbmFtZS5cclxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCAtIFRoZSBuYW1lIG9mIGFuIGV2ZW50LlxyXG4gICAgICogQHBhcmFtIHsuLi4qfSBhcmcgLSBhZGRpdGlvbmFsIGFyZ3VtZW50cyB0byBwYXNzIHRvIGV2ZW50IGhhbmRsZXIuXHJcbiAgICAgKi9cclxuICAgIHNlbmQ6IGZ1bmN0aW9uIHNlbmQoLyogZXZlbnQgLCAuLi5hcmdzICovKSB7XHJcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xyXG4gICAgICAgIHZhciBtb2R1bGUgPSBhcmdzLnNoaWZ0KCk7XHJcbiAgICAgICAgYXJnc1swXSA9IG1vZHVsZSArICdfXycgKyBhcmdzWzBdO1xyXG4gICAgICAgIGlwYy5zZW5kLmFwcGx5KG51bGwsIGFyZ3MpO1xyXG4gICAgfSxcclxuXHJcbiAgICBnZXRFdmVudE5hbWU6IGZ1bmN0aW9uIGdldEV2ZW50TmFtZShtb2R1bGUsIGV2ZW50KSB7XHJcbiAgICAgICAgcmV0dXJuIG1vZHVsZSArICdfXycgKyBldmVudDtcclxuICAgIH1cclxufTtcclxuIl0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9
