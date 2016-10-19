![Logo](meteor-desktop.png)

# WORK IN PROGRESS

# Meteor Desktop
###### aka Meteor Electron Desktop Client
> Build desktop apps with Meteor & Electron. Full integration with hot code push implementation.

```bash
 cd /your/meteor/app
 npm install --save-dev meteor-desktop
 meteor --mobile-server=127.0.0.1:3000
 
 # open new terminal
 npm run desktop -- init
 npm run desktop
```

## What is this?

This is a complete implementation of integration between `Meteor` and `Electron` aiming to achieve the same level of developer experience like `Meteor` gives. To make it clear from the start, this is a **desktop client** - it is just like your mobile clients with cordova - but for desktops with Electron. It also features a full hot code push implementation - which means you can release updates the same way you are used to.

## Prerequisites

 - Meteor >= `1.3.3`<sup>*</sup>
 - At least basic [Electron](http://electron.atom.io/) ecosystem knowledge  

<sup>*</sup> `meteor-desktop` is not actively tested with older Meteor versions, however it should be compatible with >= `1.2` - check [Meteor pre 1.3.3 support](#pre)
