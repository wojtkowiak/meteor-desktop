/* eslint-disable no-console */
require('reify');
const shell = require('shelljs');
const path = require('path');

const testsPath = path.resolve(path.join(__dirname, '..', '..', 'tests'));
const testsTmpPath = path.resolve(path.join(testsPath, '.__tmp'));

shell.config.fatal = true;
const appDir = path.join(testsTmpPath, 'test-desktop');

shell.rm('-rf', testsTmpPath);
console.log('creating test dir');
shell.mkdir('-p', testsTmpPath);
console.log('creating test meteor app');
shell.exec('meteor create test-desktop --release=METEOR@1.4.2.1', { cwd: testsTmpPath });

console.log('npm install');
shell.exec('meteor npm install ../../..', { cwd: appDir });
shell.exec('npm install --save babel-runtime', { cwd: appDir });
if (process.env.TRAVIS) {
    shell.config.fatal = false;
    shell.exec('meteor add-platform android', { cwd: appDir });
    shell.exec('meteor build ../build --server=127.0.0.1:3000', { cwd: appDir });
}
