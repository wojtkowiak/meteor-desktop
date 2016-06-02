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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1vZHVsZXMvbW9kdWxlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLElBQUksVUFBVSxRQUFRLFVBQVIsRUFBb0IsT0FBbEM7O0FBRUEsSUFBSSxVQUFVOztBQUVWLGNBQVU7QUFGQSxDQUFkOzs7Ozs7Ozs7O0FBYUEsU0FBUyxNQUFULENBQWdCLElBQWhCLEVBQXNCO0FBQ2xCLFNBQUssS0FBTCxHQUFhLElBQWI7QUFDQSxTQUFLLGdCQUFMLEdBQXdCLEVBQXhCO0FBQ0g7Ozs7Ozs7O0FBUUQsT0FBTyxTQUFQLENBQWlCLEtBQWpCLEdBQXlCLFNBQVMsSUFBVCxDQUFjLEtBQWQsRUFBcUIsSUFBckIsRUFBMkI7QUFDaEQsUUFBSSxDQUFDLFFBQVEsUUFBYixFQUF1QixNQUFNLElBQUksS0FBSixDQUFVLGdEQUFWLENBQU47QUFDdkIsWUFBUSxRQUFSLENBQWlCLElBQWpCLENBQXNCLEtBQXRCLEVBQTZCLElBQTdCO0FBQ0gsQ0FIRDs7Ozs7Ozs7QUFXQSxPQUFPLFNBQVAsQ0FBaUIsZUFBakIsR0FBbUMsU0FBUyxlQUFULENBQXlCLEtBQXpCLEVBQWdDLElBQWhDLEVBQXNDO0FBQ3JFLFNBQUssS0FBTCxDQUFXLEtBQVgsRUFBa0IsSUFBbEI7QUFDSCxDQUZEOzs7Ozs7OztBQVVBLE9BQU8sU0FBUCxDQUFpQixJQUFqQixHQUF3QixTQUFTLElBQVQsQ0FBYyxLQUFkLEVBQXFCLElBQXJCLEVBQTJCO0FBQy9DLFNBQUssS0FBTCxDQUFXLEtBQUssYUFBTCxDQUFtQixLQUFuQixDQUFYLEVBQXNDLElBQXRDO0FBQ0gsQ0FGRDs7Ozs7Ozs7QUFVQSxPQUFPLFNBQVAsQ0FBaUIsRUFBakIsR0FBc0IsU0FBUyxFQUFULENBQVksS0FBWixFQUFtQixRQUFuQixFQUE2QjtBQUMvQyxZQUFRLEVBQVIsQ0FBVyxLQUFLLGFBQUwsQ0FBbUIsS0FBbkIsQ0FBWCxFQUFzQyxTQUFTLE9BQVQsQ0FBaUIsYUFBakIsRUFBZ0MsSUFBaEMsRUFBc0M7QUFDeEUsZ0JBQVEsUUFBUixHQUFtQixjQUFjLE1BQWpDO0FBQ0EsaUJBQVMsYUFBVCxFQUF3QixJQUF4QjtBQUNILEtBSEQ7QUFJSCxDQUxEOzs7Ozs7OztBQWFBLE9BQU8sU0FBUCxDQUFpQixFQUFqQixHQUFzQixTQUFTLEVBQVQsQ0FBWSxLQUFaLEVBQW1CLFFBQW5CLEVBQTZCO0FBQy9DLFlBQVEsRUFBUixDQUFXLEtBQUssYUFBTCxDQUFtQixLQUFuQixDQUFYLEVBQXNDLFNBQVMsT0FBVCxDQUFpQixhQUFqQixFQUFnQyxJQUFoQyxFQUFzQztBQUN4RSxnQkFBUSxRQUFSLEdBQW1CLGNBQWMsTUFBakM7QUFDQSxpQkFBUyxhQUFULEVBQXdCLElBQXhCO0FBQ0gsS0FIRDtBQUlILENBTEQ7Ozs7Ozs7OztBQWVBLE9BQU8sU0FBUCxDQUFpQixhQUFqQixHQUFpQyxTQUFTLGFBQVQsQ0FBdUIsS0FBdkIsRUFBOEI7QUFDM0QsV0FBTyxLQUFLLEtBQUwsR0FBYSxJQUFiLEdBQW9CLEtBQTNCO0FBQ0gsQ0FGRDs7QUFJQSxPQUFPLE9BQVAsR0FBaUIsTUFBakIiLCJmaWxlIjoibW9kdWxlcy9tb2R1bGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgaXBjTWFpbiA9IHJlcXVpcmUoJ2VsZWN0cm9uJykuaXBjTWFpbjtcblxudmFyIGdsb2JhbHMgPSB7XG4gICAgLy8gUGxhY2UgdG8gc3RvcmUgdGhlIHJlZmVyZW5jZSB0byB0aGUgcmVuZGVyZXIgcHJvY2Vzcy5cbiAgICByZW5kZXJlcjogbnVsbFxufTtcblxuLyoqXG4gKiBTaW1wbGUgYWJzdHJhY3Rpb24gb3ZlciBlbGVjdHJvbidzIElQQy4gRW5zdXJlcyBtb2R1bGVzIHdpbGwgbm90IGNvbmZsaWN0IHdpdGggZWFjaCBvdGhlciBieVxuICogcHJvdmlkaW5nIGV2ZW50cyBuYW1lc3BhY2UuIEl0IGlzIGFsc28gYSBzZWN1cml0eSBsYXllciBhcyBpdCBpcyB0aGUgb25seSBjb21tdW5pY2F0aW9uIGNoYW5uZWxcbiAqIGJldHdlZW4geW91ciBhcHAgYW5kIG5vZGUgZW52aXJvbm1lbnQuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBOYW1lIG9mIHRoZSBtb2R1bGUuXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gTW9kdWxlKG5hbWUpIHtcbiAgICB0aGlzLl9uYW1lID0gbmFtZTtcbiAgICB0aGlzLl9ldmVudHNDYWxsYmFja3MgPSB7fTtcbn1cblxuLyoqXG4gKiBTZW5kcyBhbiBJUEMgZXZlbnQuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IGV2ZW50IC0gRXZlbnQgbmFtZS5cbiAqIEBwYXJhbSB7Kj19ICAgICBkYXRhICAtIERhdGEgdG8gc2VuZC5cbiAqL1xuTW9kdWxlLnByb3RvdHlwZS5fc2VuZCA9IGZ1bmN0aW9uIHNlbmQoZXZlbnQsIGRhdGEpIHtcbiAgICBpZiAoIWdsb2JhbHMucmVuZGVyZXIpIHRocm93IG5ldyBFcnJvcignTm8gcmVmZXJlbmNlIHRvIHJlbmRlcmVyIHByb2Nlc3MgKG1ldGVvcikgeWV0LicpO1xuICAgIGdsb2JhbHMucmVuZGVyZXIuc2VuZChldmVudCwgZGF0YSk7XG59O1xuXG4vKipcbiAqIFNlbmRzIGFuIGdlbmVyYWwgSVBDIGV2ZW50IHdpdGggZGF0YS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gZXZlbnQgLSBFdmVudCBuYW1lLlxuICogQHBhcmFtIHsqPX0gICAgIGRhdGEgIC0gRGF0YSB0byBzZW5kLlxuICovXG5Nb2R1bGUucHJvdG90eXBlLnNlbmRHbG9iYWxFdmVudCA9IGZ1bmN0aW9uIHNlbmRHbG9iYWxFdmVudChldmVudCwgZGF0YSkge1xuICAgIHRoaXMuX3NlbmQoZXZlbnQsIGRhdGEpO1xufTtcblxuLyoqXG4gKiBTZW5kcyBhbmQgSVBDIGV2ZW50IHdpdGggZGF0YS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gZXZlbnQgLSBFdmVudCBuYW1lLlxuICogQHBhcmFtIHsqPX0gICAgIGRhdGEgIC0gRGF0YSB0byBzZW5kLlxuICovXG5Nb2R1bGUucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbiBzZW5kKGV2ZW50LCBkYXRhKSB7XG4gICAgdGhpcy5fc2VuZCh0aGlzLl9nZXRFdmVudE5hbWUoZXZlbnQpLCBkYXRhKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgY2FsbGJhY2sgdG8gYSBJUEMgZXZlbnQuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9ICAgZXZlbnQgICAgLSBFdmVudCBuYW1lLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayB0byBmaXJlLlxuICovXG5Nb2R1bGUucHJvdG90eXBlLm9uID0gZnVuY3Rpb24gb24oZXZlbnQsIGNhbGxiYWNrKSB7XG4gICAgaXBjTWFpbi5vbih0aGlzLl9nZXRFdmVudE5hbWUoZXZlbnQpLCBmdW5jdGlvbiBvbkV2ZW50KHJlY2VpdmVkRXZlbnQsIGFyZ3MpIHtcbiAgICAgICAgZ2xvYmFscy5yZW5kZXJlciA9IHJlY2VpdmVkRXZlbnQuc2VuZGVyO1xuICAgICAgICBjYWxsYmFjayhyZWNlaXZlZEV2ZW50LCBhcmdzKTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGEgY2FsbGJhY2sgdG8gYSBJUEMgZXZlbnQuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9ICAgZXZlbnQgICAgLSBFdmVudCBuYW1lLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayB0byBmaXJlLlxuICovXG5Nb2R1bGUucHJvdG90eXBlLm9uID0gZnVuY3Rpb24gb24oZXZlbnQsIGNhbGxiYWNrKSB7XG4gICAgaXBjTWFpbi5vbih0aGlzLl9nZXRFdmVudE5hbWUoZXZlbnQpLCBmdW5jdGlvbiBvbkV2ZW50KHJlY2VpdmVkRXZlbnQsIGFyZ3MpIHtcbiAgICAgICAgZ2xvYmFscy5yZW5kZXJlciA9IHJlY2VpdmVkRXZlbnQuc2VuZGVyO1xuICAgICAgICBjYWxsYmFjayhyZWNlaXZlZEV2ZW50LCBhcmdzKTtcbiAgICB9KTtcbn07XG5cblxuLyoqXG4gKiBDb25jYXRlbmF0ZXMgbW9kdWxlIG5hbWUgd2l0aCBldmVudCBuYW1lLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBldmVudCAtIEV2ZW50IG5hbWUuXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxuICogQHByaXZhdGVcbiAqL1xuTW9kdWxlLnByb3RvdHlwZS5fZ2V0RXZlbnROYW1lID0gZnVuY3Rpb24gX2dldEV2ZW50TmFtZShldmVudCkge1xuICAgIHJldHVybiB0aGlzLl9uYW1lICsgJ19fJyArIGV2ZW50O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBNb2R1bGU7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
