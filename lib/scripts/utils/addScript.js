import fs from 'fs';
import path from 'path';

// Assuming that we are in the project root dir.
const packageJsonPath = path.resolve(
    path.join(process.cwd(), 'package.json'));

function readJsonFile(jsonFilePath) {
    console.log(packageJsonPath);
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

export default function addScript(name, script, fail) {
    const packageJson = readJsonFile(packageJsonPath);
    if (!(packageJson && packageJson.name)) {
        fail();
        return;
    }

    if (!('scripts' in packageJson)) {
        packageJson.scripts = {};
    }

    if (!(name in packageJson.scripts)) {
        packageJson.scripts[name] = script;
    }

    if (!writeJsonFile(packageJsonPath, packageJson)) {
        fail();
    }
}
