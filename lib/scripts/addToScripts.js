/* eslint-disable no-console */
import fs from 'fs';

const packageJsonPath = '../../package.json';

function readJsonFile(jsonFilePath) {
    try {
        return JSON.parse(fs.readFileSync(jsonFilePath, 'UTF-8'));
    } catch (e) {
        return false;
    }
}

function writeJsonFile(jsonFilePath, jsonContents) {
    try {
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonContents, null, 2));
    } catch (e) {
        return false;
    }
    return true;
}

function fail() {
    console.error('[meteor-desktop] failed to add meteor-desktop to your package.json scripts, ' +
        'please add it manually as \'desktop\': \'meteor-desktop\'');
    process.exit(0);
}

const packageJson = readJsonFile(packageJsonPath);
if (!(packageJson && packageJson.name)) {
    fail();
}

if (!('scripts' in packageJson)) {
    packageJson.scripts = { desktop: 'meteor-desktop' };
} else if (!('desktop' in packageJson.scripts)) {
    packageJson.scripts.desktop = 'meteor-desktop';
}

if (!writeJsonFile(packageJsonPath, packageJson)) {
    fail();
}
console.log('[meteor-desktop] successfully added a \'desktop\' entry in your package.json scripts' +
    ' section.');
