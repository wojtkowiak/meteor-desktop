import shell from 'shelljs';
import path from 'path';
import fs from 'fs';
import paths from '../helpers/paths';
shell.config.fatal = true;

//shell.mkdir('-p', paths.testsTmpPath);
console.log('create');
//shell.exec('meteor create test-desktop --release=METEOR@1.4.1.3', { cwd: paths.testsTmpPath });
let appDir = path.join(paths.testsTmpPath, 'test-desktop');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
const packages = Object.keys(packageJson.dependencies).map((dep) => `${dep}@${packageJson.dependencies[dep]}`).join(' ');
console.log(`npm install ${packages}`);
// NYC seems to mess with executing `npm install` or `meteor npm install` so we are
// pointing directly to npm-cli.js as a workaround.
const npmPath = path.join(appDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
shell.exec(`node ${npmPath} install ${packages}`, { cwd: appDir });
//shell.exec(`meteor npm install install ${packages}`, { cwd: appDir });
console.log('done npm');

