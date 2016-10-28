/* eslint-disable no-console */
/**
 * This script adds a 'desktop' entry to 'scripts' in package.json. If the entry already exists
 * it leaves it untouched.
 */
import fs from 'fs';

// Assuming that we are in node_modules/meteor-desktop we need to reach for package.json that is
// two levels up.
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

const test = 'cross-env NODE_ENV=test ava .desktop/**/*.test.js -s --verbose';
const testWatch = 'cross-env NODE_ENV=test ava .desktop/**/*.test.js -s --verbose' +
    ' --watch --source .desktop';

if (!('scripts' in packageJson)) {
    packageJson.scripts = {};
}

if (!('desktop' in packageJson.scripts)) {
    packageJson.scripts.desktop = 'meteor-desktop';
}

packageJson.scripts['test-desktop'] = test;
packageJson.scripts['test-desktop-watch'] = testWatch;

if (!writeJsonFile(packageJsonPath, packageJson)) {
    fail();
}
console.log('[meteor-desktop] successfully added a \'desktop\', \'test-desktop\' and' +
    ' \'test-desktop-watch\' entries to your package.json scripts section.');
