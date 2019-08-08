## v2.1.0 <sup>xx.xx.2019</sup>

* Update some dependencies and fixes some vulnerabilities
* Added support for Electron 5 (by [`KoenLav`](https://github.com/KoenLav) in [`#227`](https://github.com/wojtkowiak/meteor-desktop/pull/227))
* Allow config header Access-Control-Allow-Origin on LocalServer module (by [`cbh6`](https://github.com/cbh6) in [`#216`](https://github.com/wojtkowiak/meteor-desktop/pull/216))
* Fix mas build (by [`wojtkowiak`](https://github.com/wojtkowiak)) in [`#214`](https://github.com/wojtkowiak/meteor-desktop/pull/214))
* Update default electron version to latest (5.0.7)

## v2.0.0 <sup>02.10.2018</sup>

The main aim of this version is to decouple `electron`, `electron-builder` and `electron-packager` from this package.
Until now every `meteor-desktop` release came with specific versions of those pinned to it.
Now you are free to use any version with your meteor project. Just add them to your `devDependencies`.
If you will not, `meteor-desktop` adds the recommended versions automatically when needed.

From now every `meteor-desktop` release will provide a recommended versions numbers of these dependencies.
By default I will try to make `meteor-desktop` compatible within the compatibility version of the recommended version i.e. if the recommended electron version is `2.0.10` you should still be able to use any `2.x.x` version without problems.

**Recommended versions:**
* [`electron`](https://github.com/electron/electron) -> `2.0.10`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) -> `20.28.4`


**BREAKING:**
* support for Squirrel autoupdate mechanism ended, if you wish to continue with it, add the `electron-builder-squirrel-windows` dependency to your `devDependencies` and move it's settings to `squirrel` section in settings i.e.:
    ```
        "squirrel": {
            "autoUpdateFeedUrl": "http://127.0.0.1/update/:platform/:version",
            "autoUpdateFeedHeaders": {},
            "autoUpdateCheckOnStart": true
        },
    ```

    All builtin support will be definitely removed in January 2019.

## v1.7.0 <sup>28.09.2018</sup>
* [`electron`](https://github.com/electron/electron) was updated to `2.0.10`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `20.28.4`
* `electron-builder-squirrel-windows` was updated to `20.28.3`
* new functionality/cli setting `--prod-debug` which forces devTools to be included in a production build, if you want this to be preserved after desktopHCP you need to run Meteor server with `METEOR_DESKTOP_PROD_DEBUG=1`

## v1.6.0 <sup>25.07.2018</sup>
* [`electron`](https://github.com/electron/electron) was updated to `2.0.5`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `20.23.1`
* `electron-builder-squirrel-windows` was updated to `20.23.0`
* new functionality and new setting `exposedModules` which allows to expose any Electron renderer module i.e. `webFrame` which when defined in the settings will be available as `Desktop.electron.webFrame`
* fixed HCP switching to new version only after app restart

## v1.5.0 <sup>11.07.2018</sup>
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `20.20.0`
* `electron-builder-squirrel-windows` was updated to `20.19.0`

## v1.4.0 <sup>09.07.2018</sup>
* [`electron`](https://github.com/electron/electron) was updated to `2.0.4`

## v1.3.0 <sup>26.06.2018</sup>
* [`electron`](https://github.com/electron/electron) was updated to `2.0.3`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `20.16.2` (once again thanks to [devlar](https://github.com/develar) for accepting meteor-desktop specific pull requests PR [electron-builder#2975](https://github.com/electron-userland/electron-builder/pull/2975))
* `electron-builder-squirrel-windows` was updated to `20.16.0`

## v1.2.0 <sup>18.06.2018</sup>
* `-i, --ignore-stderr [string]` cli cmd added, normally using `-b` when meteor outputs anything to stderr the build gets terminated, but in some cases you might want to avoid that when for example npm package throws a deprecation warning into stderr, now you can make the build continue

Example - `npm run desktop -- build-installer -b` gets terminated because `meteor run` outputs a `Node#moveTo was deprecated. Use Container#append.` warning to stderr. This will kill your build and prevent from going further. Because clearly that is something we can live with you can go forward with:
```  
npm run desktop -- build-installer -b -i "Node#moveTo"
```

You do not have to put the whole line, just any part of it that should only be found in that message.

## v1.1.0 <sup>23.05.2018</sup>
* `setDefaultFetchTimeout` and `call` methods added to both `Module` and `Desktop`
* [`electron`](https://github.com/electron/electron) was updated to `2.0.2`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `20.14.7`   
* `electron-builder-squirrel-windows` was updated to `20.14.6`

**FIXES**
* fix [#165](https://github.com/wojtkowiak/meteor-desktop/issues/174) `meteor://` protocol is now registered as secure origin
* `bundler` caching was disabled for production builds as you might have accidentally get a development `desktop.asar` build into your production build

## v1.0.0 <sup>21.05.2018</sup>
Meteor App serving mechanism was changed to utilise `registerStreamProtocol` and serve
the app on constant `meteor://desktop` url instead of setting a http server which serves over `http://127.0.0.1:<random_port_on_every_start>`.

This finally solves the longstanding problems with `IndexedDB` and `localstorage` not being persistent.

Please verify thoroughly if your app is working fine after this change and reports any problems you encounter.

The localstorage contents will be migrated if you are updating your app from pre `1.0.0`.

However if you are using the `meteor-desktop-localstorage` plugin you have to make a migration yourself. The easiest way is to copy the plugin desktop code as your module in `.desktop` and on your app start get the contents with `getAll` and save them to the browser's localstorage.     

* [`electron`](https://github.com/electron/electron) was updated to `2.0.1`
* `MD_LOG_LEVEL` is now respected
* `-d`/`--debug` option added to run electron with `--debug=5858` switch
* `beforeLocalServerInit` event added to the `eventsBus`
* `METEOR_DESKTOP_DEBUG` now produces a lot more info from bundler plugin while building meteor project
* default installer in the scaffold for Windows is now set to `nsis`

**DEPRECATIONS:**
* builtin support for squirrel auto update

**BREAKING:**
* support for the `meteor-desktop-localstorage` plugin is removed, you will not be able to use this plugin anymore

## v0.19.0 <sup>17.05.2018</sup>
**WARNING:** in this version the localStorage/indexedDB is not working properly (it's not persistent) - please upgrade to `1.0.0`
* `desktopHCP` bundler plugin was enhanced with cache - that should speed up your rebuilds
* issue with app not being rebuilt after an error in `.desktop` code should be resolved now (watcher should still work even after a syntax error while compiling `.desktop`)
* [`electron`](https://github.com/electron/electron) was updated to `2.0.0`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `20.13.5`   
* `electron-builder-squirrel-windows` was updated to `20.13.1`

#### v0.18.1 <sup>10.05.2018</sup>
* fix `ReferenceError: context is not defined` in `build-installer` on `OSX`

## v0.18.0 <sup>08.05.2018</sup>
* `moduleLoadFailed` event added
* fixed desktop HCP app restart, this is now triggered with `app.quit` instead of `app.exit` which now fires properly all callbacks
* [`electron`](https://github.com/electron/electron) was updated to `1.8.6`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `20.11.1`   
* `electron-builder-squirrel-windows` was updated to `20.11.0`
* [`electron-packager`](https://github.com/electron-userland/electron-packager) was updated to `12.0.2`

#### v0.17.2 <sup>30.04.2018</sup>
* fix [#165](https://github.com/wojtkowiak/meteor-desktop/issues/165) `build-installer` failing on windows

## v0.17.0 <sup>26.04.2018</sup>
<sup>republished as `v0.17.1`</sup>
* upgraded to `babel@7`, which is now used to compile both the meteor-desktop itself and the produced app
* upgraded to `uglify-es`
* dropped support for `Meteor` < `1.4`
* code in your `.desktop` is now transpiled for `node@8`

## v0.16.0 <sup>25.04.2018</sup>
* [`electron`](https://github.com/electron/electron) was updated to `1.8.4`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `20.10.0`   
* `electron-builder-squirrel-windows` was updated to `20.10.0`
* [`electron-packager`](https://github.com/electron-userland/electron-packager) was updated to `12.0.1`
* added `Module.fetch` and `Desktop.respond` to be able to fetch from the main process side (as for now fetch was only implemented for renderer)
* fixed `Module.once` which was only passing single argument
* fixed `linkPackages` not working anymore

#### v0.15.3 <sup>16.04.2018</sup>
* fixed `extract` functionality for Mac/Linux - `electron-builder` prepackaged app is now correctly found on every platform   

#### v0.15.2 <sup>11.04.2018</sup>
* fixed compatibility version being calculated differently in bundler plugin and `package`/`build-installer` flow

#### v0.15.1 <sup>10.04.2018</sup>
* fixed compatibility version being calculated differently in bundler plugin and `package`/`build-installer` flow

#### v0.15.1 <sup>10.04.2018</sup>
* fixed `extract` functionality for Mac (the `node_modules/.bin` entries are now also automatically extracted when their package is extracted)

## v0.15.0 <sup>08.04.2018</sup>
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `20.8.2`   
* `electron-builder-squirrel-windows` was updated to `20.8.0`
* [`electron-packager`](https://github.com/electron-userland/electron-packager) was updated to `12.0.0`
* added automatic detection of modules that should not be packed into asar, additionally you can manually specify those via `extract` settings

#### v0.14.4 <sup>20.03.2018</sup>
* additional fixes to [`electron-builder`](https://github.com/electron-userland/electron-builder) integration

#### v0.14.2 <sup>19.03.2018</sup>
<sup>republished as `v0.14.3`</sup>
* `.desktop` version hash will include a `dev`/`prod` suffix as a quick fix to `meteor` development or production build producing the same version hash

## v0.14.0 <sup>16.03.2018</sup>
<sup>republished as `v0.14.1`</sup>
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `20.5.1`   
* `electron-builder-squirrel-windows` was updated to `20.5.0`
* [`electron-packager`](https://github.com/electron-userland/electron-packager) was updated to `11.1.0`

#### v0.13.1 <sup>15.03.2018</sup>
* additional fix to [`electron-builder`](https://github.com/electron-userland/electron-builder) integration, fixes [#149](https://github.com/wojtkowiak/meteor-desktop/issues/149)
* desktop HCP meteor plugins are no longer unnecessarily constantly added when on Windows even if they are already there

## v0.13.0 <sup>09.03.2018</sup>
* [`electron`](https://github.com/electron/electron) was updated to `1.7.12`
* `npm` has been removed from being a direct dependency, dependencies installation is now performed entirely by [`electron-builder`](https://github.com/electron-userland/electron-builder) which calls your `meteor npm` or system's `npm`
* local npm dependencies (`file:`) are now installed by [`install-local`](https://github.com/nicojs/node-install-local)
* native modules rebuild mechanism is enabled by default now and there is no way of turning it off (`rebuildNativeNodeModules` is obsolete and no longer taken into account)
* several small improvements to [`electron-builder`](https://github.com/electron-userland/electron-builder) integration

## v0.12.0 <sup>23.02.2018</sup>
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `20.0.8`   
* `electron-builder-squirrel-windows` was updated to `20.0.5`
* [`electron-packager`](https://github.com/electron-userland/electron-packager) was updated to `11.0.1`
* **DEPRECATIONS**:
    - building for `squirrel.windows` is not encouraged and from `1.0.0` the default Windows target will be `nsis`  

it's more than sure that you will have to update your [`electron-builder`](https://github.com/electron-userland/electron-builder)/[`electron-packager`](https://github.com/electron-userland/electron-packager) configuration since it's a big shift from the old versions, create a new meteor project with blank scaffold (`npm run desktop -- init`) and take a look a the new `settings.json` as that might give you some hints

#### v0.11.3 <sup>17.01.2018</sup>
- added `desktopHCPCompatibilityVersion` setting to restore ability to override desktopHCP compatibility version
- added `singleInstance` setting

#### v0.11.2 <sup>29.11.2017</sup>
- fixed local filesystem URL whitespace support [#133](https://github.com/wojtkowiak/meteor-desktop/issues/133) (thanks [met5678](https://github.com/met5678), PR: [#134](https://github.com/wojtkowiak/meteor-desktop/pull/134) )
- start startup timer on _cold_ start if a new version is used for the first time [meteor#9386](https://github.com/meteor/meteor/issues/9386)

#### v0.11.1 <sup>06.11.2017</sup>
- republished `0.11.0` with Meteor 1.5 because of [meteor#9308](https://github.com/meteor/meteor/issues/9308)

## v0.11.0 <sup>03.11.2017</sup>
<sup>republished as 0.11.1</sup>
* [`electron`](https://github.com/electron/electron) was updated to `1.7.9` ([PR](https://github.com/wojtkowiak/meteor-desktop/pull/126))

## v0.10.0 <sup>12.09.2017</sup>
> v0.9.0 failed to publish

* added `windowSettings` event

#### v0.8.1 <sup>10.08.2017</sup>

* fix for respecting `--ia32` in `run`/`build`/`package`

## v0.8.0 <sup>05.07.2017</sup>

- added `builderCliOptions` that allow you to specify additional electron-builder CLI options e.g
 for publishing artifacts (thanks to [ramijarrar](https://github.com/ramijarrar), related
 [PR](https://github.com/wojtkowiak/meteor-desktop/pull/112))

#### v0.7.2 <sup>10.06.2017</sup>

* fix for the case when `eTag`s are stripped from the http response when proxying meteor
server through proxy [#107](https://github.com/wojtkowiak/meteor-desktop/issues/107)
* fix for supporting Meteor 1.5 which actually was failing because of `1.5` being a non semver
strict version [#103](https://github.com/wojtkowiak/meteor-desktop/issues/103)

#### v0.7.1 <sup>08.05.2017</sup>
* fixed bug in `Desktop.fetch` which when called multiple times with the same event, was serving the response only for the first call [#79](https://github.com/wojtkowiak/meteor-desktop/issues/79)   

## v0.7.0 <sup>04.05.2017</sup>
- added `--meteor-settings <path>` cmd option to pass `--settings <path>` to meteor when building with `-b`
* fix to make `-b` not fail because of [meteor#8592](https://github.com/meteor/meteor/issues/8592)
* documented `beforeReload` event

#### v0.6.2 <sup>12.04.2017</sup>
* fixed [#82](https://github.com/wojtkowiak/meteor-desktop/issues/82)   
* [`electron`](https://github.com/electron/electron) was updated to `1.4.16`

#### v0.6.1 <sup>02.03.2017</sup>
- `meteor-desktop-splash-screen` version in the default scaffold updated to [`0.3.0`](https://github.com/wojtkowiak/meteor-desktop-splash-screen#changelog)

## v0.6.0 <sup>27.02.2017</sup>
- added experimental fix for `localStorage` getting lost - you can enable it by adding `"experimentalLocalStorage": true` to `settings.json`
- `meteor-desktop-splash-screen` version in the default scaffold updated to [`0.2.0`](https://github.com/wojtkowiak/meteor-desktop-splash-screen#changelog)
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `13.11.1`
* `electron-builder-squirrel-windows` was updated to `13.10.1`
* [`electron-packager`](https://github.com/electron-userland/electron-packager) was updated to `8.5.2`

#### v0.5.3 <sup>17.02.2017</sup>
- `omega:meteor-desktop-bundler` now fails when disk operation fails (`shelljs.config.fatal =
true`)   
- `METEOR_DESKTOP_DEBUG` env var introduced (currently only prints additional info for `bundler`
plugin)

#### v0.5.1 <sup>15.02.2017</sup>
- fixed `extracted` directory getting lost when building for platform/arch different from the
host
- fixed dependency loading for desktopHCP `bundler` plugin

## v0.5.0 <sup>08.02.2017</sup>
* `Desktop.fetch` rejects with `timeout` string in case of timeout
* you can now see internal backlog of this project in Taiga
[here](https://tree.taiga.io/project/wojtkowiak-meteor-desktop/kanban) - roadmap
will be published in form of epics
* [`electron`](https://github.com/electron/electron) was updated to `1.4.15`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `13.0.0`
* `electron-builder-squirrel-windows` was updated to `13.2.0`
* [`electron-packager`](https://github.com/electron-userland/electron-packager) was updated to `8.5.1`

## v0.4.0 <sup>11.01.2017</sup>
* added `showWindowOnStartupDidComplete` option to help fixing [#42](https://github.com/wojtkowiak/meteor-desktop/issues/42)   
* various fixes for `0.3.0` issues reported [#51](https://github.com/wojtkowiak/meteor-desktop/issues/51)
* [`electron`](https://github.com/electron/electron) was updated to `1.4.14`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `11.2.4`
* `electron-builder-squirrel-windows` was updated to `11.2.3`
* [`electron-packager`](https://github.com/electron-userland/electron-packager) was updated to `8.5.0`

## v0.3.0 <sup>10.01.2016</sup>
* `localServer` was rewritten to use `send` instead of `serve-static`
[[5f084e6](https://github.com/wojtkowiak/meteor-desktop/commit/5f084e64fa11e4894e4c7c8d541b0b02a8676111)]
* url aliases for local filesystem and `.desktop/assets` added
([more](#accessing-local-filesystem-in-meteor))
* building for Windows Store is now possible (thanks to hard work of
[@develar](https://github.com/develar))
* default dependencies for `Skeleton App` were updated
[[7d6e00d](https://github.com/wojtkowiak/meteor-desktop/commit/7d6e00d803f472f47d4e1ee38de2cd8240fbc468),
[1d1075a](https://github.com/wojtkowiak/meteor-desktop/commit/1d1075a1eec288c1372ccd001c197fab29f71980)]
(this changes compatibility version, so apps built with <0.3.0 will not receive desktopHCP
updates)
* [`electron`](https://github.com/electron/electron) was updated to `1.4.13`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `11.2.0`
* `electron-builder-squirrel-windows` was updated to `11.2.0`
* [`electron-packager`](https://github.com/electron-userland/electron-packager) was updated to `8.4.0`

#### v0.2.6 <sup>17.12.2016</sup>
 - added some additional log messages

#### v0.2.5 <sup>10.12.2016</sup>
- republished `0.2.4`

#### v0.2.4 <sup>09.12.2016</sup>
- fixed [#40](https://github.com/wojtkowiak/meteor-desktop/issues/40) [[#33](https://github.com/wojtkowiak/meteor-desktop/issues/33)]

#### v0.2.3 <sup>06.12.2016</sup>
- fixed [#33](https://github.com/wojtkowiak/meteor-desktop/issues/33)   

#### v0.2.2 <sup>29.11.2016</sup>
- republished `0.2.1` because of published plugins being in a unknown, erroneous
state [meteor#8113](https://github.com/meteor/meteor/issues/8113)   

#### v0.2.1 <sup>23.11.2016</sup>
- fixed `rebuildNativeNodeModules` which stopped working after update of
[`electron-builder`](https://github.com/electron-userland/electron-builder)

## v0.2.0 <sup>17.10.2016</sup>
* several types of npm dependencies versions declarations are now supported i.e.: local paths,
file protocol, github links and http(s) links -> [npm documentation](https://docs.npmjs.com/files/package.json#dependencies)
* development environment setup script was added
* specifying target platforms for `build-installer` is now not restricted -
check [Building installer](#building-installer), fixes [#14](https://github.com/wojtkowiak/meteor-desktop/issues/14)
* [`electron`](https://github.com/electron/electron) was updated to `1.4.6`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `8.6.0`

#### v0.1.4 <sup>16.11.2016</sup>
* fixed [#22](https://github.com/wojtkowiak/meteor-desktop/issues/22)  
* fixed bug in uncaught exception handler in the scaffold - check [here](https://github.com/wojtkowiak/meteor-desktop/commit/1dc8347f18d2ebc1dfb3f875a66e1d5206441af8)

#### v0.1.3 <sup>15.11.2016</sup>
- added warning for possible console syntax mistake when invoking with command or
option (missing ` -- ` delimiter)

#### v0.1.2 <sup>13.11.2016</sup>
- fixed [#10](https://github.com/wojtkowiak/meteor-desktop/issues/10)

#### v0.1.1 <sup>10.11.2016</sup>
- `meteor-desktop-splash-screen` version in the default scaffold updated to [`0.0.31`](https://github.com/wojtkowiak/meteor-desktop-splash-screen#changelog)

## v0.1.0 <sup>07.10.2016</sup>
- first public release
