/**
 * Dummy module which is called on the renderer process startup, so that the Module can save a
 * reference to the renderer.
 *
 * @type {Module}
 */

import Module from './module';

const dummy = new Module('dummyModule');

// Nothing to do here since Module is already setting this reference for us.
dummy.on('setRendererReference', Function.prototype);

export default function Dummy() {}
