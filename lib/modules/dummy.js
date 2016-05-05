/**
 * Dummy module which is called on the renderer process startup, so that the Module can save a
 * reference to the renderer.
 * 
 * @type {Module}
 */

var Module = require('./module.js');
var module = new Module('dummyModule');

module.on('setRendererReference', function setRendererReference() {
    // Nothing to do here since Module is already setting this reference for us.
});
