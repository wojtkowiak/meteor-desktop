/* eslint-disable prefer-arrow-callback */
Package.describe({
    name: 'meteor-community:meteor-desktop-watcher',
    version: '2.2.6',
    summary: 'Watches .desktop dir and triggers rebuilds on file change.',
    git: 'https://github.com/Meteor-Community-Packages/meteor-desktop',
    documentation: 'README.md',
    debugOnly: true
});

Npm.depends({
    chokidar: '2.0.2'
});

Package.onUse(function onUse(api) {
    api.versionsFrom('METEOR@1.3.3');
    api.use('ecmascript');
    api.use([
        'meteor-community:meteor-desktop-bundler@2.2.6',
    ], ['server'], {
        weak: true
    });
    api.addFiles([
        'watcher.js'
    ], 'server');
});
