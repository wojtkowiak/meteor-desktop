## Classes

<dl>
<dt><a href="#Desktop">Desktop</a></dt>
<dd></dd>
</dl>

## Functions

<dl>
<dt><a href="#on">on(module, event, callback)</a></dt>
<dd><p>Invokes callback when the specified IPC event is fired.</p>
</dd>
<dt><a href="#once">once(module, event, callback, response)</a></dt>
<dd><p>Invokes a callback once when the specified IPC event is fired.</p>
</dd>
<dt><a href="#removeListener">removeListener(module, event, callback)</a></dt>
<dd><p>Unregisters a callback.</p>
</dd>
<dt><a href="#removeAllListeners">removeAllListeners(module, event)</a></dt>
<dd><p>Unregisters all callbacks.</p>
</dd>
<dt><a href="#send">send(module, event, ...args)</a></dt>
<dd><p>Send an event to the main Electron process.</p>
</dd>
<dt><a href="#fetch">fetch(module, event, timeout, ...args)</a> ⇒ <code>Promise</code></dt>
<dd><p>Fetches some data from main process by sending an IPC event and waiting for a response.
Returns a promise that resolves when the response is received.</p>
</dd>
<dt><a href="#sendGlobal">sendGlobal(...args)</a></dt>
<dd><p>Send an global event to the main Electron process.</p>
</dd>
</dl>

## Typedefs

<dl>
<dt><a href="#ipcListener">ipcListener</a> : <code>function</code></dt>
<dd><p>Callback passed to ipc on/once methods.</p>
</dd>
</dl>

<a name="Desktop"></a>

## Desktop
**Kind**: global class  
<a name="new_Desktop_new"></a>

### new Desktop()
Simple abstraction over electron's IPC. Securely wraps ipcRenderer.
Available as `Desktop` global.

<a name="on"></a>

## on(module, event, callback)
Invokes callback when the specified IPC event is fired.

**Kind**: global function  
**Access:** public  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>string</code> | module name |
| event | <code>string</code> | name of an event |
| callback | <code>[ipcListener](#ipcListener)</code> | function to invoke when `event` is triggered |

<a name="once"></a>

## once(module, event, callback, response)
Invokes a callback once when the specified IPC event is fired.

**Kind**: global function  
**Access:** public  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| module | <code>string</code> |  | module name |
| event | <code>string</code> |  | name of an event |
| callback | <code>[ipcListener](#ipcListener)</code> |  | function to invoke when `event` is triggered |
| response | <code>boolean</code> | <code>false</code> | whether we are listening for fetch response |

<a name="removeListener"></a>

## removeListener(module, event, callback)
Unregisters a callback.

**Kind**: global function  
**Access:** public  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>string</code> | module name |
| event | <code>string</code> | name of an event |
| callback | <code>function</code> | listener to unregister |

<a name="removeAllListeners"></a>

## removeAllListeners(module, event)
Unregisters all callbacks.

**Kind**: global function  
**Access:** public  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>string</code> | module name |
| event | <code>string</code> | name of an event |

<a name="send"></a>

## send(module, event, ...args)
Send an event to the main Electron process.

**Kind**: global function  
**Access:** public  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>string</code> | module name |
| event | <code>string</code> | name of an event |
| ...args | <code>\*</code> | arguments to send with the event |

<a name="fetch"></a>

## fetch(module, event, timeout, ...args) ⇒ <code>Promise</code>
Fetches some data from main process by sending an IPC event and waiting for a response.
Returns a promise that resolves when the response is received.

**Kind**: global function  
**Access:** public  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| module | <code>string</code> |  | module name |
| event | <code>string</code> |  | name of an event |
| timeout | <code>number</code> | <code>2000</code> | how long to wait for the response in milliseconds |
| ...args | <code>\*</code> |  | arguments to send with the event |

<a name="sendGlobal"></a>

## sendGlobal(...args)
Send an global event to the main Electron process.

**Kind**: global function  
**Access:** public  

| Param | Type | Description |
| --- | --- | --- |
| ...args | <code>\*</code> | arguments to the ipc.send(event, arg1, arg2) |

<a name="ipcListener"></a>

## ipcListener : <code>function</code>
Callback passed to ipc on/once methods.

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>string</code> | event name |
| [...args] | <code>\*</code> | event's arguments |

