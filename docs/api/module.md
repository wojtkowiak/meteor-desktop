## Classes

<dl>
<dt><a href="#Module">Module</a></dt>
<dd></dd>
</dl>

## Functions

<dl>
<dt><a href="#send">send(event, [...data])</a></dt>
<dd><p>Sends an IPC event with data.</p>
</dd>
<dt><a href="#respond">respond(event, fetchId, [...data])</a></dt>
<dd><p>Sends and IPC event response for a provided fetch id.</p>
</dd>
<dt><a href="#on">on(event, callback)</a></dt>
<dd><p>Registers a callback to a IPC event.</p>
</dd>
<dt><a href="#removeListener">removeListener(module, event, callback)</a></dt>
<dd><p>Unregisters a callback.</p>
</dd>
<dt><a href="#removeAllListeners">removeAllListeners(module, event)</a></dt>
<dd><p>Unregisters all callbacks.</p>
</dd>
<dt><a href="#once">once(event, callback)</a></dt>
<dd><p>Registers a once fired callback to a IPC event.</p>
</dd>
<dt><a href="#sendGlobal">sendGlobal(event, [...data])</a></dt>
<dd><p>Sends a plain IPC event without namespacing it.</p>
</dd>
</dl>

<a name="Module"></a>

## Module
**Kind**: global class  
<a name="new_Module_new"></a>

### new Module()
Simple abstraction over electron's IPC. Ensures modules will not conflict with each other by
providing events namespace. It is also a security layer as it is the only communication channel
between your app and node environment.

<a name="send"></a>

## send(event, [...data])
Sends an IPC event with data.

**Kind**: global function  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>string</code> | event name |
| [...data] | <code>\*</code> | data to send with the event |

<a name="respond"></a>

## respond(event, fetchId, [...data])
Sends and IPC event response for a provided fetch id.

**Kind**: global function  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>string</code> | event name |
| fetchId | <code>number</code> | fetch id that came with then event you are                           responding to |
| [...data] | <code>\*</code> | data to send with the event |

<a name="on"></a>

## on(event, callback)
Registers a callback to a IPC event.

**Kind**: global function  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>string</code> | event name |
| callback | <code>function</code> | callback to fire |

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

<a name="once"></a>

## once(event, callback)
Registers a once fired callback to a IPC event.

**Kind**: global function  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>string</code> | event name |
| callback | <code>function</code> | callback to fire |

<a name="sendGlobal"></a>

## sendGlobal(event, [...data])
Sends a plain IPC event without namespacing it.

**Kind**: global function  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>string</code> | event name |
| [...data] | <code>\*</code> | data to send with the event |

