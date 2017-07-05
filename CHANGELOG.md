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
* `electron-builder` was updated to `13.11.1`
* `electron-builder-squirrel-windows` was updated to `13.10.1`
* `electron-packager` was updated to `8.5.2`

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
* `electron-builder` was updated to `13.0.0`
* `electron-builder-squirrel-windows` was updated to `13.2.0`
* `electron-packager` was updated to `8.5.1`

## v0.4.0 <sup>11.01.2017</sup>

* added `showWindowOnStartupDidComplete` option to help fixing [#42](https://github.com/wojtkowiak/meteor-desktop/issues/42)   
* various fixes for `0.3.0` issues reported [#51](https://github.com/wojtkowiak/meteor-desktop/issues/51)
* `electron` was updated to `1.4.14`
* `electron-builder` was updated to `11.2.4`
* `electron-builder-squirrel-windows` was updated to `11.2.3`
* `electron-packager` was updated to `8.5.0`

## v0.3.0 <sup>10.01.2017</sup>

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
* `electron-builder` was updated to `11.2.0`
* `electron-builder-squirrel-windows` was updated to `11.2.0`
* `electron-packager` was updated to `8.4.0`

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
`electron-builder`

## v0.2.0 <sup>17.10.2017</sup>
* several types of npm dependencies versions declarations are now supported i.e.: local paths, 
file protocol, github links and http(s) links -> [npm documentation](https://docs.npmjs.com/files/package.json#dependencies)
* development environment setup script was added
* specifying target platforms for `build-installer` is now not restricted - 
check [Building installer](#building-installer), fixes [#14](https://github.com/wojtkowiak/meteor-desktop/issues/14)
* `electron` was updated to `1.4.6`
* `electron-builder` was updated to `8.6.0`

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

## v0.1.0 <sup>07.10.2017</sup>
- first public release
