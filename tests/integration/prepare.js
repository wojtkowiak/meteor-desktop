require('reify');
const shell = require('shelljs');
const path = require('path');
const fs = require('fs');

const testsPath = path.resolve(path.join(__dirname, '..', '..', 'tests'));
const testsTmpPath = path.resolve(path.join(testsPath, '.__tmp'));

shell.config.fatal = true;
shell.rm('-rf', testsTmpPath);
console.log('creating test dir');
shell.mkdir('-p', testsTmpPath);
console.log('creating test meteor app');
shell.exec('meteor create test-desktop --release=METEOR@1.4.2', { cwd: testsTmpPath });

const appDir = path.join(testsTmpPath, 'test-desktop');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
const packages = Object.keys(packageJson.dependencies).map(
    dep => `${dep}@${packageJson.dependencies[dep]}`).join(' ');
console.log(`npm install ${packages}`);
//shell.exec(`meteor npm install ${packages}`, { cwd: appDir });
shell.exec(`meteor npm install ../../..`, { cwd: appDir });
