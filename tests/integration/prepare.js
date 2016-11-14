/* eslint-disable no-console */
require('reify');
const shell = require('shelljs');
const path = require('path');

const testsPath = path.resolve(path.join(__dirname, '..', '..', 'tests'));
const testsTmpPath = path.resolve(path.join(testsPath, '.__tmp'));

shell.config.fatal = true;
shell.rm('-rf', testsTmpPath);
console.log('creating test dir');
shell.mkdir('-p', testsTmpPath);
console.log('creating test meteor app');
shell.exec('meteor create test-desktop --release=METEOR@1.4.2.1', { cwd: testsTmpPath });
const appDir = path.join(testsTmpPath, 'test-desktop');
console.log('npm install');
shell.exec('meteor npm install ../../..', { cwd: appDir });
