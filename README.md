![Logo](meteor-desktop.png)

# Meteor Desktop
###### aka Meteor Electron Desktop Client
> Build desktop apps with Meteor & Electron. Full integration with hot code push implementation.

## What is this?

This is a complete implementation of integration between `Meteor` and `Electron` aiming to achieve the same level of developer experience like `Meteor` gives. 
To make it clear from the start, this is a **desktop client** - it is just like your mobile clients with `Cordova` - but for desktops with `Electron`. It also features a full hot code push implementation - which means you can release updates the same way you are used to.  

## Prerequisites

 - Meteor >= `1.3.4`<sup>__*1__</sup>
 - at least basic [Electron](http://electron.atom.io/) framework knowledge
 - mobile platform added to project<sup>__*2__</sup>  

<sup>__*1__ `1.3.3` is supported if you will install `meteor-desktop` with `npm >= 3`</sup>

<sup>__*2__ you can always build with `--server-only` so you do not actually have to have android sdk or xcode to go on with your project</sup>

### Quick start
```bash
 cd /your/meteor/app
 meteor npm install --save-dev meteor-desktop
 # you need to have any mobile platform added (ios/android)
 meteor --mobile-server=127.0.0.1:3000
 
 # open new terminal

 npm run desktop -- init
 npm run desktop

 # or in one command `npm run desktop -- --init` 
```

# Documentation

## Architecture

If you have ever been using any `Cordova` plugins before you will find this approach alike. In `Cordova` every plugin exposes its native code through a JS api available in some global namespace like `cordova.plugins`. The approach used here is similar.

In `Electron` app, there are two processes running along in your app. The so-called `main process` and `renderer process`. Main process is just a JS code executed in `node`, and the renderer is a `Chromium` process. In this integration your `Meteor` app is run in the `renderer` process and your desktop specific code runs in the `main` process. They are communicating through IPC events. Basically the desktop side publishes its API as an IPC event listeners. In your `Meteor` code, calling it is a simple as `Desktop.send('module', 'event');`.  

Code on the desktop side is preferred to be modular - that is just for simplifying testing and encapsulating functionalities into independent modules. However you do not have to follow this style, there is an `import` dir in which you can structure your code however you want. The basics of an `Electron` app are already in place (reffered as `Skeleton App`) and your code is loaded like a plugin to it.

Below is a high level architecture diagram of this integration.

![High level architecture](high-level-arch.png)

#### How does this work with Meteor?
> <sup>or how hacky is this?</sup>

The main goal was to provide a non hacky integration without actually submitting any desktop 
oriented pull request to `Meteor`.
The whole concept is based on taking the `web.cordova` build, modifying it as little as possible 
and running it in the `Electron`'s renderer process. The current `cordova` integration 
architecture is more or less conceptually replicated. 

Currently the only modification that the mobile build is subjected to is injecting the `Meteor.isDesktop` variable. 
 
To obtain the mobile build, this integration takes the build from either `
.meteor/local/cordova-build` (version `< 1.3.4.1`) or from `.meteor/local/build/programs/web.cordova`.
Because `index.html` and `program.json` are not present in the `web.cordova` directory, they are
just downloaded from the running project.


## Scaffolding your desktop app

If you have not run the example from the Quick start paragraph, first you need to scaffold a `.desktop` dir in which your `Electron`'s main process code lives.
To do that run: (assuming `npm install --save-dev meteor-desktop` did add a `desktop` entry in the `package.json scripts` section)
```bash
npm run desktop -- init
```

This will generate an exemplary `.desktop` dir. Lets take a look what we can find there:
```
.desktop
├── assets                     # place all your assets here
├── import                     # all code you do not want to structure into modules  
├── modules                    # your desktop modules (check modules section for explanation)
│    └── example               # module example
│         ├── index.js         #  entrypoint of the example module
│         ├── example.test.js  # functional test for the example module
│         └── module.json      # module configuration  
├── desktop.js                 # your Electron main process entry point - treated like a module
├── desktop.test.js            # functional test for you desktop app
├── settings.json              # your app settings
└── squirrelEvents.js          # handling of squirrel.windows events
```

Tak a look into the files. Most of them have meaningful comments inside.

### settings.json

This is the main configuration file for your desktop app.
Below you can find brief descriptions of the fields. 

field|description
-----|-----------
`name`|just a name for your project
`version`|version of the desktop app
`projectName`|this will be used as a `name` in the generated app's package.json
`devTools`|whether to install and open `devTools`, set automatically to false when building with `--production`
`devtron`|check whether to install `devtron`, set automatically to false when building with `--production`, [more](https://github.com/wojtkowiak/meteor-desktop/tree/master#devtron)
`desktopHCP`|whether to use `.desktop` hot code push module - [more](https://github.com/wojtkowiak/meteor-desktop/tree/master#desktophcp---desktop-hot-code-push-module)
<sup>`desktopHCPIgnoreCompatibilityVersion`</sup>|ignore the `.desktop` compatibility version and install new versions even if they can be incompatible
`autoUpdateFeedUrl`|url passed to [`autoUpdater.setFeedUrl`](https://github.com/electron/electron/blob/master/docs/api/auto-updater.md#autoupdatersetfeedurlurl-requestheaders), [more](https://github.com/wojtkowiak/meteor-desktop/tree/master#desktophcp---desktop-hot-code-push-module)
`autoUpdateFeedHeaders`|http headers passed to [`autoUpdater.setFeedUrl`](https://github.com/electron/electron/blob/master/docs/api/auto-updater.md#autoupdatersetfeedurlurl-requestheaders)
`autoUpdateCheckOnStart`|whether to check for updates on app start
`rebuildNativeNodeModules`|turn on or off recompiling native modules, [more](https://github.com/wojtkowiak/meteor-desktop/tree/master#native-modules-support)
`webAppStartupTimeout`|amount of time after which the downloaded version is considered faulty if Meteor app did not start - [more](https://github.com/wojtkowiak/meteor-desktop/tree/master#hot-code-push-support)
`window`|production options for the main window - see [here](https://github.com/electron/electron/blob/master/docs/api/browser-window.md#new-browserwindowoptions)
`windowDev`|development options for the main window, applied on top of production options
`uglify`|whether to process the production build with uglify
`plugins`|meteor-desktop plugins list
`dependencies`|npm dependencies of your desktop app, the same like in `package.json`
`packageJsonFields`|fields to add to the generated `package.json` in your desktop app
`builderOptions`|[`electron-builder`](https://github.com/electron-userland/electron-builder) [options](https://github.com/electron-userland/electron-builder/wiki/Options)
`packagerOptions`|[`electron-packager`](https://github.com/electron-userland/electron-packager) [options](https://github.com/electron-userland/electron-packager/blob/master/docs/api.md)

### desktop.js

The `desktop.js` is the entrypoint of your desktop app. Let's take a look what references we 
receive in the constructor.
```javascript
     * @param {Object} log         - Winston logger instance
     * @param {Object} skeletonApp - reference to the skeleton app instance
     * @param {Object} appSettings - settings.json contents
     * @param {Object} eventsBus   - event emitter for listening or emitting events
     *                               shared across skeleton app and every module/plugin
     * @param {Object} modules     - references to all loaded modules
     * @param {Object} Module      - reference to the Module class
     * @constructor
     */
    constructor({ log, skeletonApp, appSettings, eventsBus, modules, Module })
```

#### `skeletonApp`

This is a reference to the Skeleton App. Currently there are only two methods you can call.
`isProduction` - whether this is a production build
`removeUncaughtExceptionListener` - removes the default handler so you can put your own in place

#### `eventsBus`

This is just an `EventEmitter` that is an event bus meant to be used across all entities running 
in the `Electron`'s main process (`desktop`). Currently there are several events emitted on the 
bus byt the Skeleton App that you may find useful:

event name|payload|description
----------|-------|------------
`unhandledException`| |emitted on any unhandled exceptions, by hooking to it you can run code before any other handler will be executed   
`desktopLoaded`|`(desktop)`|emitted after loading `desktop.js`, carries the desktop class reference
`startupFailed`| |emitted when the Skeleton App could not start you Meteor app  
`loadingFinished`| |emitted when the Meteor App finished loading (also after HCP reload)  
`beforeLoadFinish`| |emitted when the Meteor App finished loading, but just before the window is shown  
`windowCreated`|`(window)`|emitted when the [`BrowserWindow`](https://github.com/electron/electron/blob/master/docs/api/browser-window.md) (Chrome window with Meteor app) is  created, passes a reference to this window 
`newVersionReady|`(version)`|emitted when a new Meteor bundle was downloaded and is ready to be applied  
`revertVersionReady`|`(version)`|emitted just before the Meteor app version will be reverted (due to faulty version fallback mechanism) be applied  
`beforePluginsLoad`| |emitted before plugins are loaded
`beforeModulesLoad`| |emitted before modules from `.desktop` are loaded
`beforeDesktopJsLoad`| |emitted before `desktop.js` is loaded
`desktopLoaded`| |emitted after loading of plugins, modules and desktop.js 
`afterInitialization`| |emitted after initialization of internal modules like HCP and local HTTP server

Your can also emit events on this bus as well. A good practice is to namespace them like 
i.e. `myModule.initalized`.

#### `modules`

Object with references to other modules and plugins. Plugins are under their name i.e. 
`modules['meteor-desktop-splash-screen]`. Modules are under the name from `module.json`. 
Internal modules such as `autoupdate` and `localServer` are also there. You can also get 
reference to the `desktop.js` by `modules['desktop']` (the reference is also passed in the 
`desktopLoaded` event).

### Writing modules




### Hot code push support
https://guide.meteor.com/mobile.html#recovering-from-faulty-versions

### How to write plugins

Plugin is basically a module exported to a npm package. `module.json` is not needed and not taken
 into account because `name` and `dependencies` are already in `package.json`.  
#### `meteorDependencies` in `package.json` 
One extra feature is that you can also depend on Meteor packages through `meteorDependencies` 
field in `package.json`. Check out [`meteor-desktop-localstorage`](https://github.com/wojtkowiak/meteor-desktop-localstorage/blob/master/package.json#L52) for example.  
A good practice when your plugin contains a meteor plugin is to publish both at the same version. 
You can then use `@version` in the `meteorDependecies` to indicate that the Meteor plugin's 
version should be equal to npm package version.

If you made a plugin, please let us know so that it can be listed here.
##### List of known plugins:
[`meteor-desktop-splashscreen`](https://github.com/wojtkowiak/meteor-desktop-splash-screen)  
[`meteor-desktop-localstorage`](https://github.com/wojtkowiak/meteor-desktop-localstorage)


### Squirrel autoupdate support


### Native modules support

This integration fully supports rebuilding native modules (npm packages with native node modules) against `Electron`'s `node` version. However to speed up build time, it is **switched off by default**. 

If you have any of those in your dependencies, or you know that one of the packages or plugins is using it, you should turn it on by setting `rebuildNativeNodeModules` to true in your `settings.json`. Currently there is no mechanism present that detects whether the rebuild should be run so it is fired on every build. A cleverer approach is planned before `1.0`. 

### Devtron

[`Devtron`](http://electron.atom.io/devtron/) is installed and activated by default. It is 
automatically removed when building with `--production`. As the communication between your Meteor
 app and the desktop side goes through IPC, this tool can be very handy because it can sniff on  

### desktopHCP - `.desktop` hot code push module

### Testing desktop app and modules

