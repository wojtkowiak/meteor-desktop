/* eslint-disable prefer-arrow-callback */
Package.describe({
    name: 'omega:meteor-desktop-bundler',
    version: '0.0.77',
    summary: 'Bundles .desktop dir into desktop.asar.',
    git: 'https://github.com/wojtkowiak/meteor-desktop',
    documentation: 'README.md'
});

Package.registerBuildPlugin({
    name: 'meteor-desktop-bundler',
    use: ['ecmascript@0.1.6'],
    npmDependencies: {
        md5: '2.1.0'
    },
    sources: ['bundler.js']
});

Package.onUse(function onUse(api) {
    api.versionsFrom('1.2.1');
    api.use('isobuild:compiler-plugin@1.0.0');
    api.addFiles([
        'version._desktop_.js'
    ]);
    api.export('METEOR_DESKTOP_VERSION', 'server');
});
