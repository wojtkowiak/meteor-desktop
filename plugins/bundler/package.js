/* eslint-disable prefer-arrow-callback */
Package.describe({
    name: 'skadmin:meteor-desktop-bundler',
    version: '2.2.6',
    summary: 'Bundles .desktop dir into desktop.asar.',
    git: 'https://github.com/sharekey/meteor-desktop',
    documentation: 'README.md'
});

Package.registerBuildPlugin({
    name: 'meteor-desktop-bundler',
    use: ['ecmascript@0.4.4'],
    sources: ['bundler.js'],
    npmDependencies: { chokidar: '2.0.3' }
});

Package.onUse(function onUse(api) {
    api.versionsFrom('1.3.3');
    api.use('isobuild:compiler-plugin@1.0.0');
    api.addFiles([
        'version._desktop_.js'
    ]);
    api.export('METEOR_DESKTOP_VERSION', 'server');
});
