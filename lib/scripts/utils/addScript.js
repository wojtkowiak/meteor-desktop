import fs from 'fs';

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

export default function addScript(name, script, packageJsonPath, fail) {
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
