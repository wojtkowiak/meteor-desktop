## v0.14.0 <sup>14.03.2018</sup>
* upgraded to `babel@7`, which is now used to compile both the meteor-desktop itself and the produced app
* upgraded to `uglify-es`   

## v0.16.0 <sup>25.04.2018</sup>
* `electron` was updated to `1.8.4`
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
* `electron` was updated to `1.7.12`
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
* `electron` was updated to `1.7.9` ([PR](https://github.com/wojtkowiak/meteor-desktop/pull/126))

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
* `electron` was updated to `1.4.16`

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
* `electron` was updated to `1.4.15`
* [`electron-builder`](https://github.com/electron-userland/electron-builder) was updated to `13.0.0`
* `electron-builder-squirrel-windows` was updated to `13.2.0`
* [`electron-packager`](https://github.com/electron-userland/electron-packager) was updated to `8.5.1`

## v0.4.0 <sup>11.01.2017</sup>
* added `showWindowOnStartupDidComplete` option to help fixing [#42](https://github.com/wojtkowiak/meteor-desktop/issues/42)   
* various fixes for `0.3.0` issues reported [#51](https://github.com/wojtkowiak/meteor-desktop/issues/51)
* `electron` was updated to `1.4.14`
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
* `electron` was updated to `1.4.13`
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
* `electron` was updated to `1.4.6`
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
