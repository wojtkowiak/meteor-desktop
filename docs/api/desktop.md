## Classes

<dl>
<dt><a href="#Desktop">Desktop</a></dt>
<dd></dd>
</dl>

## Functions

<dl>
<dt><a href="#getFileUrl">getFileUrl(absolutePath)</a> ⇒ <code>string</code></dt>
<dd><p>Just a convenience method for getting an url for a file from the local file system.</p>
</dd>
<dt><a href="#getAssetUrl">getAssetUrl(assetPath)</a> ⇒ <code>string</code></dt>
<dd><p>Just a convenience method for getting an url for a file from the assets directory.</p>
</dd>
<dt><a href="#fetchFile">fetchFile(absolutePath)</a> ⇒ <code>Promise</code></dt>
<dd><p>Just a convenience method for getting a file from the local file system.
Returns a promise from <code>fetch</code>.</p>
</dd>
<dt><a href="#fetchAsset">fetchAsset(assetPath)</a> ⇒ <code>Promise</code></dt>
<dd><p>Just a convenience method for getting a file from the assets directory.
Returns a promise from <code>fetch</code>.</p>
</dd>
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
<dt><a href="#respond">respond(module, event, fetchId, [...data])</a></dt>
<dd><p>Sends and IPC event response for a provided fetch id.</p>
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

<a name="getFileUrl"></a>

## getFileUrl(absolutePath) ⇒ <code>string</code>
Just a convenience method for getting an url for a file from the local file system.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| absolutePath | <code>string</code> | absolute path to the file |

<a name="getAssetUrl"></a>

## getAssetUrl(assetPath) ⇒ <code>string</code>
Just a convenience method for getting an url for a file from the assets directory.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| assetPath | <code>string</code> | file path relative to assets directory |

<a name="fetchFile"></a>

## fetchFile(absolutePath) ⇒ <code>Promise</code>
Just a convenience method for getting a file from the local file system.
Returns a promise from `fetch`.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| absolutePath | <code>string</code> | absolute path to the file |

<a name="fetchAsset"></a>

## fetchAsset(assetPath) ⇒ <code>Promise</code>
Just a convenience method for getting a file from the assets directory.
Returns a promise from `fetch`.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| assetPath | <code>string</code> | file path relative to assets directory |

<a name="on"></a>

## on(module, event, callback)
Invokes callback when the specified IPC event is fired.

**Kind**: global function  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>string</code> | module name |
| event | <code>string</code> | name of an event |
| callback | [<code>ipcListener</code>](#ipcListener) | function to invoke when `event` is triggered |

<a name="once"></a>

## once(module, event, callback, response)
Invokes a callback once when the specified IPC event is fired.

**Kind**: global function  
**Access**: public  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| module | <code>string</code> |  | module name |
| event | <code>string</code> |  | name of an event |
| callback | [<code>ipcListener</code>](#ipcListener) |  | function to invoke when `event` is triggered |
| response | <code>boolean</code> | <code>false</code> | whether we are listening for fetch response |

<a name="removeListener"></a>

## removeListener(module, event, callback)
Unregisters a callback.

**Kind**: global function  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>string</code> | module name |
| event | <code>string</code> | name of an event |
| callback | <code>function</code> | listener to unregister |

<a name="removeAllListeners"></a>

## removeAllListeners(module, event)
Unregisters all callbacks.

**Kind**: global function  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>string</code> | module name |
| event | <code>string</code> | name of an event |

<a name="send"></a>

## send(module, event, ...args)
Send an event to the main Electron process.

**Kind**: global function  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>string</code> | module name |
| event | <code>string</code> | name of an event |
| ...args | <code>\*</code> | arguments to send with the event |

<a name="respond"></a>

## respond(module, event, fetchId, [...data])
Sends and IPC event response for a provided fetch id.

**Kind**: global function  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| module | <code>string</code> | module name |
| event | <code>string</code> | event name |
| fetchId | <code>number</code> | fetch id that came with then event you are                           responding to |
| [...data] | <code>\*</code> | data to send with the event |

<a name="fetch"></a>

## fetch(module, event, timeout, ...args) ⇒ <code>Promise</code>
Fetches some data from main process by sending an IPC event and waiting for a response.
Returns a promise that resolves when the response is received.

**Kind**: global function  
**Access**: public  

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
**Access**: public  

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

