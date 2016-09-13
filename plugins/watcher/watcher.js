const chokidar = Npm.require('chokidar');
const hash = Npm.require('hash-files');
const path = Npm.require('path');
const fs = Npm.require('fs');

// TODO: any better way of getting this path?
const rootPath = path.resolve(path.join(process.cwd(), '..', '..', '..', '..', '..'));

const desktopPath = path.resolve(path.join(rootPath, '.desktop'));
const versionFile = path.join(rootPath, 'version.desktop');

function saveNewVersion(version) {
    fs.writeFileSync(versionFile, JSON.stringify({
        version
    }, null, 2), 'UTF-8');
}

let version;

try {
    version = JSON.parse(
        fs.readFileSync(versionFile, 'UTF-8')
    ).version;
} catch (e) {
    throw new Error('[meteor-desktop] There is no version.desktop file. Are you sure you have ' +
        'omega:meteor-desktop-bundler package added to your project?');
}

const currentVersion = hash.sync({
    files: [`${desktopPath}${path.sep}**`]
});


if (currentVersion !== version) {
    console.info('[meteor-desktop] Initial .desktop version inconsistency found. Files have ' +
        'changed during the build, triggering desktop rebuild.');
    saveNewVersion(currentVersion);
} else {

    const watcher = chokidar.watch(desktopPath, {
        persistent: true,
        ignoreInitial: true
    });

    watcher
        .on('all', (event, filePath) => {
            console.log(`[meteor-desktop] ${filePath} have been changed, triggering desktop ` +
                'rebuild.');
            saveNewVersion(hash.sync({
                files: [`${desktopPath}${path.sep}**`]
            }));
        });
    console.log(`[meteor-desktop] Watching ${desktopPath} for changes.`);
}
