import Log from './log';
import fs from 'fs';
import spawn from 'cross-spawn';
import semver from 'semver';
import shell from 'shelljs';

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

    async checkPreconditions() {
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
            await this.addMobilePlatform(platform);
        }

        let release = fs.readFileSync(this.$.env.paths.meteorApp.release, 'UTF-8').split('\n')[0];
        release = release.split('@')[1];
        // We do not care if it is beta.
        if (~release.indexOf('-')) {
            release = release.split('-')[0];
        }
        if (!semver.satisfies(release, '>= 1.3.3')) {
            this.log.error(`wrong meteor version (${release}) in project - only >= 1.3.3 is 
            supported`);
            process.exit(1);
        }
    }

    addMobilePlatform(platform) {
        return new Promise((resolve, reject) => {
            spawn('meteor', ['add-platform', platform], {
                cwd: this.$.env.paths.electronApp.root,
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
            let timeout = null;

            function writeLog() {
                fs.writeFileSync('meteor.log', log, 'UTF-8');
            }

            this.log.info(`running meteor run --verbose --mobile-server=${this.$.env.ddpUrl}`);

            const child = spawn(
                'meteor',
                ['run', '--verbose', `--mobile-server=${this.$.env.ddpUrl}`],
                {
                    cwd: this.$.env.paths.electronApp.root,
                }
            );

            child.stderr.on('data', (chunk) => {
                const line = chunk.toString('UTF-8');
                log += `${line}\n`;
            });


            child.stdout.on('data', (chunk) => {
                const line = chunk.toString('UTF-8');
                log += `${line}\n`;
                if (~line.indexOf('App running at')) {
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
    }

    injectIsDesktop() {
        const manifest = fs.readFileSync(this.$.env.paths.meteorApp.cordovaBuildProgramJson).manifest;
        const injected = false;

        manifest.forEach(function eachAsset(file) {
            var fileContents;
            // Hacky way of setting isDesktop.
            if (file.type === 'js') {
                fileContents = fs.readFileSync(join(appDir, file.path), 'UTF-8');
                if (fileContents.indexOf('.isCordova=!0') ||
                    fileContents.indexOf('.isCordova = true')) {
                    injected = true;
                }
                fileContents = fileContents.replace('.isCordova=!0', '.isDesktop=!0');
                fileContents = fileContents.replace('.isCordova = true', '.isDesktop= true');
                fileContents = fileContents.replace(
                    /\((\w+.)(isCordova)\)([\S\s]*?)(startupDidComplete)/,
                    '($1isDesktop)$3$4');
                fs.writeFileSync(join(appDir, file.path), fileContents);
            }
        });

        if (!injected) {
            console.error('Error injecting isDesktop global var.');
            process.exit(1);
        }
    }

    async build() {
        this.log.info('checking for any mobile platform');
        await this.checkPreconditions().catch(() => {
            this.log.error('Failed to add a mobile platform. Try to do it manually.');
            process.exit(1);
        });

        this.log.info('building meteor app');

        if (false) {
            await this.buildMobileTarget().catch(reason => {
                if (reason === 'timeout') {
                    this.log.error('timeout while building, log has been written to meteor.log');
                }
                if (reason === 'exit') {
                    this.log.error('meteor cmd exited unexpectedly, log has been written to meteor.log');
                }
                process.exit(1);
            });
        }

        this.copyBuild();
        this.injectIsDesktop();



    }


}


module.exports = MeteorApp;

