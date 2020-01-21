/* eslint-disable no-console */
require('reify');
// CI cache version: 1

const tempDir = require('temp-dir');
const shell = require('shelljs');
const path = require('path');
const fs = require('fs');

const testsTmpPath = path.resolve(path.join(tempDir, '.__tmp_int'));

const meteorVersion = '1.8.1';

shell.config.fatal = true;
const appDir = path.join(testsTmpPath, 'test-desktop');

shell.rm('-rf', testsTmpPath);

if (!fs.existsSync(testsTmpPath) || !fs.existsSync(path.join(appDir, 'package.json'))) {
    console.log('creating test dir');
    shell.mkdir('-p', testsTmpPath);
    console.log('creating test meteor app');
    shell.exec(`meteor create test-desktop --release=METEOR@${meteorVersion}`, { cwd: testsTmpPath });
    const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    packageJson.dependencies['meteor-desktop'] = path.resolve(path.join(__dirname, '..', '..' ));
    if (process.env.APPVEYOR) {
        const versions = require('../../lib/defaultDependencies');
        packageJson.dependencies.electron = versions.electron;
        packageJson.dependencies['electron-builder'] = versions['electron-builder'];
    }
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packageJson, null, 2));
} else {
    const currentVersion = fs.readFileSync(path.join(appDir, '.meteor', 'release'), 'utf-8').split('@')[1].replace(/[\r\n]/gm, '');
    if (currentVersion !== meteorVersion) {
        console.log('updating meteor version');
        shell.exec(`meteor update --release=METEOR@${meteorVersion} --all-packages`, { cwd: appDir });
    }
    console.log('meteor npm prune');
    shell.exec('meteor npm prune', { cwd: appDir });
}
console.log('meteor npm install');
shell.exec('meteor npm install', { cwd: appDir });


if (process.env.TRAVIS) {
    shell.config.fatal = false;
    shell.exec('meteor add-platform android', { cwd: appDir });
    console.log(shell.exec('meteor build ../build --server=127.0.0.1:3000', { cwd: appDir }));
} else {
    // This should bootstrap cordova.
    console.log('adding platform ios');
    shell.exec('meteor add-platform ios', { cwd: appDir });
    console.log('removing  platform ios');
    shell.exec('meteor remove-platform ios', { cwd: appDir });
}
