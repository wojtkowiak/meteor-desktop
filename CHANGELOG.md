#### v0.5.2 <sup>17.02.2017</sup>
- `omega:meteor-desktop-bundler` now fails when disk operation fails (`shelljs.config.fatal = 
true`)   
- `METEOR_DESKTOP_DEBUG` env var was added (currently only work ) 

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
* `electron-packager` was updated to `8.5.10`

## v0.4.0 <sup>11.01.2017</sup>

* added `showWindowOnStartupDidComplete` option to help fixing [#42](https://github.com/wojtkowiak/meteor-desktop/issues/33)   
* various fixes for `0.3.0` issues reported [#51](https://github.com/wojtkowiak/meteor-desktop/issues/40)
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
