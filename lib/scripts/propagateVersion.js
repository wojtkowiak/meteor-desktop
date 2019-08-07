// This propagates the version from package.json to Meteor plugins.

const { version } = require('../../package.json');
const fs = require('fs');

const paths = ['./plugins/bundler/package.js', './plugins/watcher/package.js'];
paths.forEach((path) => {
    let packageJs = fs.readFileSync(path, 'UTF-8');
    packageJs = packageJs.replace(/(version: ')([^']+)'/, `$1${version}'`);
    if (~path.indexOf('watcher')) {
        packageJs = packageJs.replace(/(skadmin:meteor-desktop-bundler@)([^']+)'/, `$1${version}'`);
    }
    fs.writeFileSync(path, packageJs);
});
