/* eslint-disable no-console */
const fs = Npm.require('fs');
const path = Npm.require('path');

/**
 * Saves version hash to the version file.
 * @param {string} version
 * @param {string} versionFile
 */
function saveNewVersion(version, versionFile) {
    fs.writeFileSync(versionFile, JSON.stringify({
        version
    }, null, 2), 'UTF-8');
}

/**
 * Tries to read a settings.json file from desktop dir.
 *
 * @param {string} desktopPath - Path to the desktop dir.
 * @returns {Object}
 */
function getSettings(desktopPath) {
    let settings = {};
    try {
        settings = JSON.parse(
            fs.readFileSync(path.join(desktopPath, 'settings.json'), 'UTF-8')
        );
    } catch (e) {
        return {};
    }
    return settings;
}

// TODO: any better way of getting this path?
const rootPath = path.resolve(path.join(process.cwd(), '..', '..', '..', '..', '..'));
const desktopPath = path.resolve(path.join(rootPath, '.desktop'));

const settings = getSettings(desktopPath);
if (!('desktopHCP' in settings) || !settings.desktopHCP) {
    console.warn('[meteor-desktop] will not watch for changes is .desktop because there is no ' +
        '.desktop/settings.json or desktopHCP is set to false.  Remove this plugin if you do ' +
        'not want to use desktopHCP.');
} else if ('omega:meteor-desktop-bundler' in Package) {
    const chokidar = Npm.require('chokidar');
    const hash = Npm.require('hash-files');
    const versionFile = path.join(rootPath, 'version.desktop');


    const version =
        typeof Package['omega:meteor-desktop-bundler'].METEOR_DESKTOP_VERSION === 'object' ?
            Package['omega:meteor-desktop-bundler'].METEOR_DESKTOP_VERSION.version : null;

    if (version) {
        try {
            fs.readFileSync(versionFile, 'UTF-8');
        } catch (e) {
            throw new Error('[meteor-desktop] there is no version.desktop file. Are you sure you ' +
                'have omega:meteor-desktop-bundler package added to your project?');
        }

        const currentVersion = hash.sync({
            files: [`${desktopPath}${path.sep}**`]
        });

        if (currentVersion !== version) {
            // TODO: something meteor'ish to print to stdout?
            console.info('[meteor-desktop] Initial .desktop version inconsistency found. Files ' +
                'have changed during the build, triggering desktop rebuild.');
            saveNewVersion(currentVersion, versionFile);
        } else {
            const watcher = chokidar.watch(desktopPath, {
                persistent: true,
                ignored: /tmp___/,
                ignoreInitial: true
            });

            let timeout = null;

            watcher
                .on('all', (event, filePath) => {
                    if (timeout) {
                        clearTimeout(timeout);
                    }
                    // Simple 2s debounce.
                    timeout = setTimeout(() => {
                        console.log(`[meteor-desktop] ${filePath} have been changed, triggering` +
                        ' desktop rebuild.');
                        saveNewVersion(hash.sync({
                            files: [`${desktopPath}${path.sep}**`]
                        }), versionFile);
                    }, 2000);
                });
            console.log(`[meteor-desktop] watching ${desktopPath} for changes.`);
        }
    } else {
        console.info('[meteor-desktop] .desktop HCP will not work because either web.cordova ' +
            'architecture is missing or the bundler had troubles with creating desktop.asar. Be' +
            ' sure that you are running mobile target or with --mobile-server.');
    }
} else {
    throw new Error('[meteor-desktop] bundler plugin was not detected. Are you sure you have ' +
        'omega:meteor-desktop-bundler package added to your project?');
}
