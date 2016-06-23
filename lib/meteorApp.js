import Log from './log';
import fs from 'fs';
import spawn from 'cross-spawn';
import semver from 'semver';
import shell from 'shelljs';
import path from 'path';
const { join } = path;
import singleLineLog from 'single-line-log';
const sll = singleLineLog(process.stdout);
import asar from 'asar';

/**
 * Represents the Meteor app.
 */
class MeteorApp {

    /**
     * @param {Object} $ - Context.
     * @constructor
     */
    constructor($) {
        this.log = new Log('meteorApp');
        this.$ = $;
        this.mobilePlatform = null;
        this.oldManifest = null;
    }

    /**
     * Validate meteor version against a versionRange.
     * @param {string} versionRange - Semver version range.
     */
    checkMeteorVersion(versionRange) {
        let release = fs.readFileSync(this.$.env.paths.meteorApp.release, 'UTF-8').split('\n')[0];
        release = release.split('@')[1];
        // We do not care if it is beta.
        if (~release.indexOf('-')) {
            release = release.split('-')[0];
        }
        release = release.match(/(^\d+\.\d+\.\d+)/gmi)[0];
        if (!semver.satisfies(release, versionRange)) {
            if (this.$.env.options.skipMobileBuild) {
                this.log.error(`wrong meteor version (${release}) in project - only ` +
                    `${versionRange} is supported`
                );
            } else {
                this.log.error(`wrong meteor version (${release}) in project - only ` +
                    `${versionRange} is supported for automatic meteor builds (you can always ` +
                    'try with `--skip-mobile-build` if you are using meteor >= 1.2.1'
                );
            }
            process.exit(1);
        }
    }

    /**
     * Checks required preconditions.
     * - Meteor version
     * - is mobile platform added
     */
    async checkPreconditions() {
        if (this.$.env.options.skipMobileBuild) {
            this.checkMeteorVersion('>= 1.2.1');
        } else {
            this.checkMeteorVersion('>= 1.3.3');
        }

        if (!this.$.env.options.skipMobileBuild) {
            const platforms = fs.readFileSync(this.$.env.paths.meteorApp.platforms, 'UTF-8');
            if (!~platforms.indexOf('android') && !~platforms.indexOf('ios')) {
                if (this.$.env.os.isOsx && !this.$.env.options.android) {
                    this.mobilePlatform = 'ios';
                } else {
                    this.mobilePlatform = 'android';
                }
                this.log.warn(`no mobile target detected - will add '${this.mobilePlatform}' ` +
                    'just to get a mobile build.'
                );
                try {
                    await this.addMobilePlatform(this.mobilePlatform);
                } catch (e) {
                    this.log.error('Failed to add a mobile platform. Try to do it manually.');
                    process.exit(1);
                }
            }
        }
    }

    /**
     * Tries to add a mobile platform to meteor project.
     * @param {string} platform - Platform to add.
     * @returns {Promise}
     */
    addMobilePlatform(platform) {
        return new Promise((resolve, reject) => {
            spawn('meteor', ['add-platform', platform], {
                cwd: this.$.env.paths.meteorApp.root,
                stdio: this.$.env.stdio
            }).on('exit', () => {
                const platforms = fs.readFileSync(this.$.env.paths.meteorApp.platforms, 'UTF-8');
                if (!~platforms.indexOf('android') && !~platforms.indexOf('ios')) {
                    reject();
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Tries to remove a mobile platform from meteor project.
     * @param {string} platform - Platform to add.
     * @returns {Promise}
     */
    removeMobilePlatform(platform) {
        return new Promise((resolve, reject) => {
            spawn('meteor', ['remove-platform', platform], {
                cwd: this.$.env.paths.meteorApp.root,
                stdio: this.$.env.stdio
            }).on('exit', () => {
                const platforms = fs.readFileSync(this.$.env.paths.meteorApp.platforms, 'UTF-8');
                if (~platforms.indexOf(platform)) {
                    reject();
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Just checks for index.html and program.json existence.
     * @returns {*}
     */
    isCordovaBuildReady() {
        return fs.existsSync(this.$.env.paths.meteorApp.cordovaBuildIndex) &&
            fs.existsSync(this.$.env.paths.meteorApp.cordovaBuildProgramJson) &&
            (
                !this.oldManifest ||
                (this.oldManifest &&
                    this.oldManifest != fs.readFileSync(
                        this.$.env.paths.meteorApp.cordovaBuildProgramJson, 'UTF-8')
                )
            );
    }

    /**
     * Tries to get a mobile build from meteor app.
     * In case of failure leaves a meteor.log.
     * @returns {Promise}
     */
    buildMobileTarget() {

        if (fs.existsSync(this.$.env.paths.meteorApp.cordovaBuildProgramJson)) {
            this.oldManifest = fs.readFileSync(
                this.$.env.paths.meteorApp.cordovaBuildProgramJson, 'UTF-8');
        }

        return new Promise((resolve, reject) => {
            const self = this;
            let log = '';
            let end = false;
            let timeout = null;
            let errorTimeout = null;
            let messageTimeout = null;
            let portProblem = false;
            let killTimeout = null;
            let cordovaCheckInterval = null;

            function writeLog() {
                fs.writeFileSync('meteor.log', log, 'UTF-8');
            }

            const commands = ['run', '--verbose', `--mobile-server=${this.$.env.options.ddpUrl}`];
            if (this.$.env.options.production) {
                commands.push('--production');
            }
            commands.push('-p');
            if (this.$.env.options.meteorPort) {
                commands.push(this.$.env.options.meteorPort);
            } else {
                commands.push('3080');
            }

            this.log.info(`running "meteor ${commands.join(' ')}"... this might take a while`);

            const child = spawn(
                'meteor',
                commands,
                {
                    cwd: this.$.env.paths.meteorApp.root
                }
            );

            function kill() {
                sll('');
                clearInterval(cordovaCheckInterval);
                clearTimeout(killTimeout);
                if (self.$.env.os.isWindows) {
                    spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
                } else {
                    child.kill('SIGKILL');
                }
                writeLog();
            }

            cordovaCheckInterval = setInterval(() => {
                if (this.isCordovaBuildReady()) {
                    killTimeout = setTimeout(() => {
                        sll('');
                        end = true;
                        clearTimeout(timeout);
                        timeout = null;
                        kill();
                        resolve();
                    }, 1000);
                }
            }, 1000);

            child.stderr.on('data', (chunk) => {
                const line = chunk.toString('UTF-8');
                log += `${line}\n`;
                if (errorTimeout) {
                    clearTimeout(errorTimeout);
                }
                errorTimeout = setTimeout(() => {
                    sll('');
                    kill();
                    reject('error');
                }, 1000);
            });

            child.stdout.on('data', (chunk) => {
                const line = chunk.toString('UTF-8');
                if (!end && line.trim().replace(/[\n\r\t]/gm, '') !== '') {
                    const linesToDisplay = line.trim()
                        .replace(/[\t]/gm, '')
                        .replace(/[\n\r]/gm, '|')
                        .split('|');
                    sll(linesToDisplay.pop());
                }
                log += `${line}\n`;
                if (~line.indexOf('after_platform_add')) {
                    sll('');
                    this.log.info('done... 10%');
                }

                if (~line.indexOf('Your application has errors. Waiting for file change.')) {
                    if (errorTimeout) {
                        clearTimeout(errorTimeout);
                    }
                    errorTimeout = setTimeout(() => {
                        kill();
                        reject('errorInApp');
                    }, 1000);
                }

                if (~line.indexOf('Local package version')) {
                    if (messageTimeout) {
                        clearTimeout(messageTimeout);
                    }
                    messageTimeout = setTimeout(() => {
                        sll('');
                        this.log.info('building in progress...');
                    }, 1500);
                }

                if (~line.indexOf('Preparing Cordova project')) {
                    sll('');
                    this.log.info('done... 60%');
                }

                if (~line.indexOf('Can\'t listen on port')) {
                    portProblem = true;
                }

                if (~line.indexOf('App running at')) {
                    end = true;
                    clearTimeout(timeout);
                    timeout = null;
                    kill();
                    resolve();
                }
            });

            child.on('exit', () => {
                clearTimeout(timeout);
                timeout = null;
                sll('');
                writeLog();
                clearInterval(cordovaCheckInterval);
                clearTimeout(killTimeout);
                if (portProblem) {
                    reject('port');
                } else {
                    reject('exit');
                }
            });

            timeout = setTimeout(() => {
                kill();
                writeLog();
                reject('timeout');
            }, this.$.env.options.buildTimeout ? this.$.env.options.buildTimeout : 600000);
        });
    }

    /**
     * Validates the mobile build and copies it to electron app.
     */
    copyBuild() {
        shell.rm('-rf', this.$.env.paths.electronApp.meteorApp);
        this.log.debug('cleared build dir');

        if (!fs.existsSync(this.$.env.paths.meteorApp.cordovaBuild)) {
            this.log.error(`No cordova_build found at ${this.$.env.paths.meteorApp.cordovaBuild}`);
            process.exit(1);
        }

        if (!fs.existsSync(this.$.env.paths.meteorApp.cordovaBuildIndex)) {
            this.log.error('No index.html found in cordova_build found at ' +
                `${this.$.env.paths.meteorApp.cordovaBuild}`);
            process.exit(1);
        }

        if (!fs.existsSync(this.$.env.paths.meteorApp.cordovaBuildProgramJson)) {
            this.log.error('No program.json found in cordova_build found at ' +
                `${this.$.env.paths.meteorApp.cordovaBuild}`);
            process.exit(1);
        }

        shell.cp(
            '-R', this.$.env.paths.meteorApp.cordovaBuild, this.$.env.paths.electronApp.meteorApp
        );
        this.log.info('mobile build copied to electron app');

        this.log.debug('move cordova.js to meteor build');
        shell.mv(
            '-f',
            join(__dirname, '..', 'skeleton', 'cordova.js'),
            this.$.env.paths.electronApp.meteorApp
        );
    }

    /**
     * Injects Meteor.isDesktop
     */
    injectIsDesktop() {
        this.log.info('injecting isDesktop');
        const startupDidCompleteRegEx = /\((\w+.)(isCordova)\)([\S\s]*?)(startupDidComplete)/;
        const startupDidCompleteProductionRegEx =
            /(\w+.)(isCordova)([\S\s]*?)(startupDidComplete)/;

        try {
            const manifest = JSON.parse(
                fs.readFileSync(this.$.env.paths.meteorApp.cordovaBuildProgramJson, 'UTF-8')
            ).manifest;
            let injected = false;
            let injectedStartupDidComplete = false;

            manifest.forEach((file) => {
                let fileContents;
                // Hacky way of setting isDesktop.
                if (file.type === 'js') {
                    fileContents = fs.readFileSync(
                        join(this.$.env.paths.electronApp.meteorApp, file.path),
                        'UTF-8'
                    );
                    fileContents = fileContents.replace('.isCordova=!0', '.isDesktop=!0');
                    fileContents = fileContents.replace('.isCordova = true', '.isDesktop= true');

                    if (startupDidCompleteRegEx.test(fileContents) ||
                        startupDidCompleteProductionRegEx.test(fileContents)) {
                        injectedStartupDidComplete = true;
                    }

                    fileContents = fileContents.replace(
                        startupDidCompleteRegEx,
                        '($1isDesktop)$3$4');
                    fileContents = fileContents.replace(
                        startupDidCompleteProductionRegEx,
                        '$1isDesktop$3$4');

                    if (fileContents.indexOf('.isDesktop=!0') ||
                        fileContents.indexOf('.isDesktop = true')) {
                        injected = true;
                    }

                    fs.writeFileSync(
                        join(this.$.env.paths.electronApp.meteorApp, file.path), fileContents
                    );
                }
            });

            if (!injected) {
                this.log.error('error injecting isDesktop global var.');
                process.exit(1);
            }
            if (!injectedStartupDidComplete) {
                this.log.error('error injecting isDesktop for startupDidComplete');
                process.exit(1);
            }
        } catch (e) {
            this.log.error('error occured while injecting isDesktop: ', e);
            process.exit(1);
        }
        this.log.info('injected successfully');
    }

    /**
     * Builds, modifies and copies the meteor app to electron app.
     */
    async build() {
        this.log.info('checking for any mobile platform');
        try {
            await this.checkPreconditions();
        } catch (e) {
            this.log.error('error occurred during checking preconditions: ', e);
            process.exit(1);
        }

        this.log.info('building meteor app');

        if (!this.$.env.options.skipMobileBuild) {
            try {
                await this.buildMobileTarget();
            } catch (reason) {
                switch (reason) {
                    case 'timeout':
                        this.log.error(
                            'timeout while building, log has been written to meteor.log');
                        break;
                    case 'error':
                        this.log.error(
                            'some errors were reported during build, check meteor.log for more' +
                            ' info');
                        break;
                    case 'errorInApp':
                        this.log.error(
                            'your meteor app has errors - look into meteor.log for more' +
                            ' info');
                        break;
                    case 'port':
                        this.log.error(
                            'your port 3080 is currently used (you probably have this or other ' +
                            'meteor project running?), use `-t` or `--meteor-port` to use ' +
                            'different port while building');
                        break;
                    case 'exit':
                        this.log.error(
                            'meteor cmd exited unexpectedly, log has been written to meteor.log');
                        break;
                    default:
                        this.log.error('error occurred during building mobile target', reason);
                }
                if (this.mobilePlatform) {
                    await this.removeMobilePlatform(this.mobilePlatform);
                }
                process.exit(1);
            }
        }

        this.copyBuild();

        this.injectIsDesktop();

        await this.packToAsar();

        this.log.info('meteor build finished');

        if (this.mobilePlatform) {
            await this.removeMobilePlatform(this.mobilePlatform);
        }
    }

    packToAsar() {
        this.log.info('packing meteor app to asar archive');
        return new Promise((resolve) => {
            asar.createPackage(
                this.$.env.paths.electronApp.meteorApp,
                path.join(this.$.env.paths.electronApp.root, 'meteor.asar'),
                () => {
                    shell.rm('-rf', this.$.env.paths.electronApp.meteorApp);
                    resolve();
                }
            );
        });
    }
}

module.exports = MeteorApp;
