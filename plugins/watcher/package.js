/* eslint-disable prefer-arrow-callback */
Package.describe({
    name: 'omega:meteor-desktop-watcher',
    version: '0.0.77',
    summary: 'Watches .desktop dir and triggers rebuilds on file change.',
    git: 'https://github.com/wojtkowiak/meteor-desktop',
    documentation: 'README.md',
    debugOnly: true
});

Npm.depends({
    chokidar: '1.6.0',
    'hash-files': '1.1.1'
});

Package.onUse(function onUse(api) {
    api.versionsFrom('METEOR@1.2.1');
    api.use('ecmascript');
    api.use([
        'omega:meteor-desktop-bundler@0.0.77',
    ], ['server'], {
        weak: true
    });
    api.addFiles([
        'watcher.js'
    ], 'server');
});
