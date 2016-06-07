import Log from './log';
import fs from 'fs';
import spawn from 'cross-spawn';
import semver from 'semver';
import shell from 'shelljs';
import path from 'path';
const { join } = path;
import singleLineLog from 'single-line-log';
const sll = singleLineLog(process.stdout);

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
    }

    checkMeteorVersion() {
        let release = fs.readFileSync(this.$.env.paths.meteorApp.release, 'UTF-8').split('\n')[0];
        release = release.split('@')[1];
        // We do not care if it is beta.
        if (~release.indexOf('-')) {
            release = release.split('-')[0];
        }
        release = release.match(/(^\d+\.\d+\.\d+)/gmi)[0];
        if (!semver.satisfies(release, '>= 1.3.3')) {
            this.log.error(`wrong meteor version (${release}) in project - only >= 1.3.3 is ` +
            'supported');
            process.exit(1);
        }
    }

    async checkPreconditions() {

        this.checkMeteorVersion();

        const platforms = fs.readFileSync(this.$.env.paths.meteorApp.platforms, 'UTF-8');
        if (!~platforms.indexOf('android') && !~platforms.indexOf('ios')) {
            let platform;
            if (this.$.env.os.isOsx) {
                platform = 'ios';
            } else {
                platform = 'android';
            }
            this.log.warn(`no mobile target detected - will add '${platform}' just to get a mobile 
             build.`);
            try {
                await this.addMobilePlatform(platform);
            } catch (e) {
                this.log.error('Failed to add a mobile platform. Try to do it manually.');
                process.exit(1);
            }
        }
    }

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


    buildMobileTarget() {
        return new Promise((resolve, reject) => {
            let log = '';
            let end = false;
            let timeout = null;

            function writeLog() {
                fs.writeFileSync('meteor.log', log, 'UTF-8');
            }

            const commands = ['run', '--verbose', '--production', `--mobile-server=${this.$.env.options.ddpUrl}`];
            if (this.$.env.options.port) {
                commands.push('-p');
                commands.push(this.$.env.options.port);
            }

            this.log.info(`running meteor run ${commands.join(' ')}`);

            const child = spawn(
                'meteor',
                commands,
                {
                    cwd: this.$.env.paths.meteorApp.root,
                }
            );

            child.stderr.on('data', (chunk) => {
                const line = chunk.toString('UTF-8');
                log += `${line}\n`;
            });


            child.stdout.on('data', (chunk) => {
                const line = chunk.toString('UTF-8');
                if (!end && line.trim().replace(/[\n\r\t]/gm, '') !== '') {
                    sll(line.trim().replace(/[\n\r\t]/gm, ''));
                }
                log += `${line}\n`;
                if (~line.indexOf('after_platform_add')) {
                    sll('');
                    this.log.info('done... 10%');
                }
                if (~line.indexOf('Preparing Cordova project')) {
                    sll('');
                    this.log.info('done... 60%');
                }
                if (~line.indexOf('App running at')) {
                    sll('');
                    end = true;
                    clearTimeout(timeout);
                    timeout = null;
                    if (this.$.env.os.isWindows) {
                        spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
                    } else {
                        child.kill('SIGKILL');
                    }
                    resolve();
                }
            });

            child.on('exit', () => {
                clearTimeout(timeout);
                timeout = null;
                writeLog();
                reject('exit');
            });

            timeout = setTimeout(() => {
                if (this.$.env.os.isWindows) {
                    spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
                } else {
                    child.kill('SIGKILL');
                }
                writeLog();
                reject('timeout');
                // TODO: parametrize timeout
            }, 10 * 60 * 1000);
        });
    }

    copyBuild() {

        shell.rm('-rf', this.$.env.paths.electronApp.meteorApp);
        this.log.debug('cleared build dir');

        if (!fs.existsSync(this.$.env.paths.meteorApp.cordovaBuild)) {
            this.log.error(`No cordova_build found at ${this.$.env.paths.meteorApp.cordovaBuild}`);
            process.exit(1);
        }

        if (!fs.existsSync(this.$.env.paths.meteorApp.cordovaBuildIndex)) {
            this.log.error(`No index.html found in cordova_build found at ${this.$.env.paths.meteorApp.cordovaBuild}`);
            process.exit(1);
        }

        if (!fs.existsSync(this.$.env.paths.meteorApp.cordovaBuildProgramJson)) {
            this.log.error(`No program.json found in cordova_build found at ${this.$.env.paths.meteorApp.cordovaBuild}`);
            process.exit(1);
        }

        shell.cp('-R', this.$.env.paths.meteorApp.cordovaBuild, this.$.env.paths.electronApp.meteorApp);
        this.log.info('mobile build copied to electron app');

        this.log.debug('move cordova.js to meteor build');
        shell.mv('-f', this.$.env.paths.electronApp.cordova, this.$.env.paths.electronApp.meteorApp);
    }

    injectIsDesktop() {
        this.log.info('injecting isDesktop');
        try {
            const manifest = JSON.parse(fs.readFileSync(this.$.env.paths.meteorApp.cordovaBuildProgramJson, 'UTF-8')).manifest;
            let injected = false;

            manifest.forEach((file) => {
                let fileContents;
                // Hacky way of setting isDesktop.
                if (file.type === 'js') {
                    fileContents = fs.readFileSync(join(this.$.env.paths.electronApp.meteorApp, file.path), 'UTF-8');
                    fileContents = fileContents.replace('.isCordova=!0', '.isDesktop=!0');
                    fileContents = fileContents.replace('.isCordova = true', '.isDesktop= true');
                    fileContents = fileContents.replace(
                        /\((\w+.)(isCordova)\)([\S\s]*?)(startupDidComplete)/,
                        '($1isDesktop)$3$4');
                    if (fileContents.indexOf('.isDesktop=!0') ||
                        fileContents.indexOf('.isDesktop = true')) {
                        injected = true;
                    }

                    fs.writeFileSync(join(this.$.env.paths.electronApp.meteorApp, file.path), fileContents);
                }
            });

            if (!injected) {
                this.log.error('Error injecting isDesktop global var.');
                process.exit(1);
            }
        } catch (e) {
            console.log(e);
        }
        this.log.info('injected successfully');
    }

    async build() {
        this.log.info('checking for any mobile platform');
        try {
            await this.checkPreconditions();
        } catch (e) {
            this.log.error('error occurred during checking preconditions: ', e);
        }

        this.log.info('building meteor app');

        try {
            await this.buildMobileTarget();
        } catch (reason) {
            switch (reason) {
                case 'timeout':
                    this.log.error('timeout while building, log has been written to meteor.log');
                    break;
                case 'exit':
                    this.log.error('meteor cmd exited unexpectedly, log has been written to meteor.log');
                    break;
                default:
                    this.log.error('error occurred during building mobile target', reason);
            }
            process.exit(1);
        }

        this.copyBuild();

        this.injectIsDesktop();

        this.log.info('meteor build finished');
    }
}

module.exports = MeteorApp;

