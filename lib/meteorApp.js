import fs from 'fs';
import spawn from 'cross-spawn';
import semver from 'semver';
import shell from 'shelljs';
import path from 'path';
import singleLineLog from 'single-line-log';
import asar from 'asar';
import fetch from 'node-fetch';

import IsDesktopInjector from '../skeleton/modules/autoupdate/isDesktopInjector';
import Log from './log';
import MeteorManager from './meteorManager';

const { join } = path;
const sll = singleLineLog.stdout;

// TODO: refactor all strategy ifs to one place

/**
 * Represents the Meteor app.
 * @property {MeteorDesktop} $
 * @class
 */
export default class MeteorApp {

    /**
     * @param {MeteorDesktop} $ - context
     * @constructor
     */
    constructor($) {
        this.log = new Log('meteorApp');
        this.$ = $;
        this.meteorManager = new MeteorManager($);
        this.mobilePlatform = null;
        this.oldManifest = null;
        this.injector = new IsDesktopInjector();
        this.matcher = new RegExp(
            '__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\("([^"]*)"\\)\\)'
        );
        this.replacer = new RegExp(
            '(__meteor_runtime_config__ = JSON.parse\\(decodeURIComponent\\()"([^"]*)"(\\)\\))'
        );
        this.meteorVersion = null;
        this.indexHTMLstrategy = null;

        this.indexHTMLStrategies = {
            INDEX_FROM_CORDOVA_BUILD: 1,
            INDEX_FROM_RUNNING_SERVER: 2
        };
    }

    /**
     * Ensures that required packages are added to the Meteor app.
     */
    async ensureDesktopHCPPackages() {
        const desktopHCPPackages = ['omega:meteor-desktop-watcher', 'omega:meteor-desktop-bundler'];
        if (this.$.desktop.getSettings().desktopHCP) {
            this.log.verbose('desktopHCP is enabled, checking for required packages');

            const packagesWithVersion = desktopHCPPackages.map(packageName => `${packageName}@${this.$.getVersion()}`);

            try {
                await this.meteorManager.ensurePackages(desktopHCPPackages, packagesWithVersion, 'desktopHCP');
            } catch (e) {
                throw new Error(e);
            }
        } else {
            this.log.verbose('desktopHCP is not enabled, removing required packages');

            try {
                if (this.meteorManager.checkPackages(desktopHCPPackages)) {
                    await this.meteorManager.deletePackages(desktopHCPPackages, 'desktopHCP');
                }
            } catch (e) {
                throw new Error(e);
            }
        }
    }

    /**
     * Adds entry to .meteor/.gitignore if necessary.
     */
    updateGitIgnore() {
        this.log.verbose('updating .meteor/.gitignore');
        // Lets read the .meteor/.gitignore and filter out blank lines.
        const gitIgnore = fs.readFileSync(this.$.env.paths.meteorApp.gitIgnore, 'UTF-8')
            .split('\n').filter(ignoredPath => ignoredPath.trim() !== '');

        if (!~gitIgnore.indexOf(this.$.env.paths.electronApp.rootName)) {
            this.log.verbose(`adding ${this.$.env.paths.electronApp.rootName} to .meteor/.gitignore`);
            gitIgnore.push(this.$.env.paths.electronApp.rootName);

            fs.writeFileSync(this.$.env.paths.meteorApp.gitIgnore, gitIgnore.join('\n'), 'UTF-8');
        }
    }

    /**
     * Reads the Meteor release version used in the app.
     * @returns {string}
     */
    getMeteorRelease() {
        let release = fs.readFileSync(this.$.env.paths.meteorApp.release, 'UTF-8')
            .replace('\r', '')
            .split('\n')[0];
        release = release.split('@')[1];
        // We do not care if it is beta.
        if (~release.indexOf('-')) {
            release = release.split('-')[0];
        }
        return release;
    }

    /**
     * Cast Meteor release to semver version.
     * @returns {string}
     */
    castMeteorReleaseToSemver() {
        return `${this.getMeteorRelease()}.0.0`.match(/(^\d+\.\d+\.\d+)/gmi)[0];
    }

    /**
     * Validate meteor version against a versionRange.
     * @param {string} versionRange - semver version range
     */
    checkMeteorVersion(versionRange) {
        const release = this.castMeteorReleaseToSemver();
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
     * Decides which strategy to use while trying to get client build out of Meteor project.
     * @returns {number}
     */
    chooseStrategy() {
        if (this.$.env.options.forceCordovaBuild) {
            return this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD;
        }

        const release = this.castMeteorReleaseToSemver();
        if (semver.satisfies(release, '> 1.3.4')) {
            return this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER;
        }
        if (semver.satisfies(release, '1.3.4')) {
            const explodedVersion = this.getMeteorRelease().split('.');
            if (explodedVersion.length >= 4) {
                if (explodedVersion[3] > 1) {
                    return this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER;
                }
                return this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD;
            }
        }
        return this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD;
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
            this.indexHTMLstrategy = this.chooseStrategy();
            if (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD) {
                this.log.debug(
                    'meteor version is < 1.3.4.2 so the index.html from cordova-build will' +
                    ' be used'
                );
            } else {
                this.log.debug(
                    'meteor version is >= 1.3.4.2 so the index.html will be downloaded ' +
                    'from __cordova/index.html'
                );
            }
        }

        if (!this.$.env.options.skipMobileBuild) {
            const platforms = fs.readFileSync(this.$.env.paths.meteorApp.platforms, 'UTF-8');
            if (!~platforms.indexOf('android') && !~platforms.indexOf('ios')) {
                if (!this.$.env.options.android) {
                    this.mobilePlatform = 'ios';
                } else {
                    this.mobilePlatform = 'android';
                }
                this.log.warn(`no mobile target detected - will add '${this.mobilePlatform}' ` +
                    'just to get a mobile build'
                );
                try {
                    await this.addMobilePlatform(this.mobilePlatform);
                } catch (e) {
                    this.log.error('failed to add a mobile platform - please try to do it manually');
                    process.exit(1);
                }
            }
        }
    }

    /**
     * Tries to add a mobile platform to meteor project.
     * @param {string} platform - platform to add
     * @returns {Promise}
     */
    addMobilePlatform(platform) {
        return new Promise((resolve, reject) => {
            this.log.verbose(`adding mobile platform: ${platform}`);
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
     * @param {string} platform - platform to remove
     * @returns {Promise}
     */
    removeMobilePlatform(platform) {
        return new Promise((resolve, reject) => {
            this.log.verbose(`removing mobile platform: ${platform}`);
            spawn('meteor', ['remove-platform', platform], {
                cwd: this.$.env.paths.meteorApp.root,
                stdio: this.$.env.stdio,
                env: Object.assign({ METEOR_PRETTY_OUTPUT: 0 }, process.env)
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
     * @returns {boolean}
     */
    isCordovaBuildReady() {
        if (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD) {
            return this.$.utils.exists(this.$.env.paths.meteorApp.cordovaBuildIndex) &&
                this.$.utils.exists(this.$.env.paths.meteorApp.cordovaBuildProgramJson) &&
                (
                    !this.oldManifest ||
                    (this.oldManifest &&
                        this.oldManifest !== fs.readFileSync(
                            this.$.env.paths.meteorApp.cordovaBuildProgramJson, 'UTF-8')
                    )
                );
        }
        return this.$.utils.exists(this.$.env.paths.meteorApp.webCordovaProgramJson) &&
            (
                !this.oldManifest ||
                (this.oldManifest &&
                    this.oldManifest !== fs.readFileSync(
                        this.$.env.paths.meteorApp.webCordovaProgramJson, 'UTF-8')
                )
            );
    }

    /**
     * Fetches index.html from running project.
     * @returns {Promise.<*>}
     */
    async acquireIndex() {
        const port = (this.$.env.options.port) ? this.$.env.options.port : 3080;
        this.log.info('acquiring index.html');
        const res = await fetch(`http://127.0.0.1:${port}/__cordova/index.html`);
        const text = await res.text();
        // Simple test if we really download index.html for web.cordova.
        if (~text.indexOf('src="/cordova.js"')) {
            return text;
        }
        return false;
    }

    /**
     * Fetches mainfest.json from running project.
     * @returns {Promise.<void>}
     */
    async acquireManifest() {
        const port = (this.$.env.options.port) ? this.$.env.options.port : 3080;
        this.log.info('acquiring manifest.json');
        const res = await fetch(
            `http://127.0.0.1:${port}/__cordova/manifest.json?meteor_dont_serve_index=true`);
        const text = await res.text();
        return JSON.parse(text);
    }

    /**
     * Tries to get a mobile build from meteor app.
     * In case of failure leaves a meteor.log.
     * A lot of stuff is happening here - but the main aim is to get a mobile build from
     * .meteor/local/cordova-build/www/application and exit as soon as possible.
     *
     * @returns {Promise}
     */
    buildMobileTarget() {
        const programJson =
            (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD) ?
                this.$.env.paths.meteorApp.cordovaBuildProgramJson :
                this.$.env.paths.meteorApp.webCordovaProgramJson;

        if (this.$.utils.exists(programJson)) {
            this.oldManifest = fs.readFileSync(programJson, 'UTF-8');
        }

        return new Promise((resolve, reject) => {
            const self = this;
            let log = '';
            let desiredExit = false;
            let buildTimeout = null;
            let errorTimeout = null;
            let messageTimeout = null;
            let killTimeout = null;
            let cordovaCheckInterval = null;
            let portProblem = false;

            function windowsKill(pid) {
                self.log.debug(`killing pid: ${pid}`);
                spawn.sync('taskkill', ['/pid', pid, '/f', '/t']);

                // We will look for other process which might have been created outside the
                // process tree.
                // Lets list all node.exe processes.
                const out = spawn
                    .sync(
                        'wmic',
                        ['process', 'where', 'caption="node.exe"', 'get', 'commandline,processid'])
                    .stdout.toString('utf-8')
                    .split('\n');
                const args = self.prepareArguments();
                // Lets mount regex.
                const regexV1 = new RegExp(`${args.join('\\s+')}\\s+(\\d+)`, 'gm');
                const regexV2 = new RegExp(`"${args.join('"\\s+"')}"\\s+(\\d+)`, 'gm');
                // No we will check for those with the matching params.
                out.forEach((line) => {
                    const match = regexV1.exec(line) || regexV2.exec(line) || false;
                    if (match) {
                        self.log.debug(`killing pid: ${match[1]}`);
                        spawn.sync('taskkill', ['/pid', match[1], '/f', '/t']);
                    }
                });
            }

            function writeLog() {
                fs.writeFileSync('meteor.log', log, 'UTF-8');
            }

            function clearTimeoutsAndIntervals() {
                clearInterval(cordovaCheckInterval);
                clearTimeout(buildTimeout);
                clearTimeout(errorTimeout);
                clearTimeout(messageTimeout);
                clearTimeout(killTimeout);
            }

            const args = this.prepareArguments();

            this.log.info(`running "meteor ${args.join(' ')}"... this might take a while`);

            // Lets spawn meteor.
            const child = spawn(
                'meteor',
                args,
                {
                    env: Object.assign(
                        { METEOR_PRETTY_OUTPUT: 0, METEOR_NO_RELEASE_CHECK: 1 }, process.env),
                    cwd: this.$.env.paths.meteorApp.root
                },
                { shell: true }
            );

            // Kills the currently running meteor command.
            function kill() {
                sll('');
                child.kill('SIGKILL');
                if (self.$.env.os.isWindows) {
                    windowsKill(child.pid);
                }
            }

            function exit() {
                killTimeout = setTimeout(() => {
                    clearTimeoutsAndIntervals();
                    desiredExit = true;
                    kill();
                    resolve();
                }, 500);
            }

            function copyBuild() {
                self.copyBuild().then(() => {
                    exit();
                }).catch(() => {
                    clearTimeoutsAndIntervals();
                    kill();
                    writeLog();
                    reject('copy');
                });
            }

            cordovaCheckInterval = setInterval(() => {
                // Check if we already have cordova-build ready.
                if (this.isCordovaBuildReady()) {
                    // If so, then exit immediately.
                    if (this.indexHTMLstrategy ===
                        this.indexHTMLStrategies.INDEX_FROM_CORDOVA_BUILD) {
                        copyBuild();
                    }
                }
            }, 1000);

            child.stderr.on('data', (chunk) => {
                const line = chunk.toString('UTF-8');
                log += `${line}\n`;
                if (errorTimeout) {
                    clearTimeout(errorTimeout);
                }
                // Do not exit if this is the warning for using --production.
                // Output exceeds -> https://github.com/meteor/meteor/issues/8592
                if (!~line.indexOf('--production') && !~line.indexOf('Output exceeds ')) {
                    // We will exit 1s after last error in stderr.
                    errorTimeout = setTimeout(() => {
                        clearTimeoutsAndIntervals();
                        kill();
                        writeLog();
                        reject('error');
                    }, 1000);
                }
            });

            child.stdout.on('data', (chunk) => {
                const line = chunk.toString('UTF-8');
                if (!desiredExit && line.trim().replace(/[\n\r\t\v\f]+/gm, '') !== '') {
                    const linesToDisplay = line.trim()
                        .split('\n\r');
                    // Only display last line from the chunk.
                    const sanitizedLine = linesToDisplay.pop().replace(/[\n\r\t\v\f]+/gm, '');
                    sll(sanitizedLine);
                }
                log += `${line}\n`;
                if (~line.indexOf('after_platform_add')) {
                    sll('');
                    this.log.info('done... 10%');
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

                if (~line.indexOf('Your application has errors')) {
                    if (errorTimeout) {
                        clearTimeout(errorTimeout);
                    }
                    errorTimeout = setTimeout(() => {
                        clearTimeoutsAndIntervals();
                        kill();
                        writeLog();
                        reject('errorInApp');
                    }, 1000);
                }

                if (~line.indexOf('App running at')) {
                    copyBuild();
                }
            });

            // When Meteor exits
            child.on('exit', () => {
                sll('');
                clearTimeoutsAndIntervals();
                if (!desiredExit) {
                    writeLog();
                    if (portProblem) {
                        reject('port');
                    } else {
                        reject('exit');
                    }
                }
            });

            buildTimeout = setTimeout(() => {
                kill();
                writeLog();
                reject('timeout');
            }, this.$.env.options.buildTimeout ? this.$.env.options.buildTimeout * 1000 : 600000);
        });
    }

    /**
     * Replaces the DDP url that was used originally when Meteor was building the client.
     * @param {string} indexHtml - path to index.html from the client
     */
    updateDdpUrl(indexHtml) {
        let content;
        let runtimeConfig;

        try {
            content = fs.readFileSync(indexHtml, 'UTF-8');
        } catch (e) {
            this.log.error(`error loading index.html file: ${e.message}`);
            process.exit(1);
        }
        if (!this.matcher.test(content)) {
            this.log.error('could not find runtime config in index file');
            process.exit(1);
        }

        try {
            const matches = content.match(this.matcher);
            runtimeConfig = JSON.parse(decodeURIComponent(matches[1]));
        } catch (e) {
            this.log.error('could not find runtime config in index file');
            process.exit(1);
        }

        if (this.$.env.options.ddpUrl.substr(-1, 1) !== '/') {
            this.$.env.options.ddpUrl += '/';
        }

        runtimeConfig.ROOT_URL = this.$.env.options.ddpUrl;
        runtimeConfig.DDP_DEFAULT_CONNECTION_URL = this.$.env.options.ddpUrl;

        content = content.replace(
            this.replacer, `$1"${encodeURIComponent(JSON.stringify(runtimeConfig))}"$3`);

        try {
            fs.writeFileSync(indexHtml, content);
        } catch (e) {
            this.log.error(`error writing index.html file: ${e.message}`);
            process.exit(1);
        }
        this.log.info('successfully updated ddp string in the runtime config of a mobile build' +
            ` to ${this.$.env.options.ddpUrl}`);
    }

    /**
     * Prepares the arguments passed to `meteor` command.
     * @returns {string[]}
     */
    prepareArguments() {
        const args = ['run', '--verbose', `--mobile-server=${this.$.env.options.ddpUrl}`];
        if (this.$.env.isProductionBuild()) {
            args.push('--production');
        }
        args.push('-p');
        if (this.$.env.options.port) {
            args.push(this.$.env.options.port);
        } else {
            args.push('3080');
        }
        if (this.$.env.options.meteorSettings) {
            args.push('--settings', this.$.env.options.meteorSettings);
        }
        return args;
    }

    /**
     * Validates the mobile build and copies it into electron app.
     */
    async copyBuild() {
        this.log.debug('clearing build dir');
        try {
            await this.$.utils.rmWithRetries('-rf', this.$.env.paths.electronApp.meteorApp);
        } catch (e) {
            throw new Error(e);
        }

        let prefix = 'cordovaBuild';
        let copyPathPostfix = '';

        if (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER) {
            prefix = 'webCordova';
            copyPathPostfix = `${path.sep}*`;
            let indexHtml;
            try {
                fs.mkdir(this.$.env.paths.electronApp.meteorApp);
                indexHtml = await this.acquireIndex();
                fs.writeFileSync(this.$.env.paths.electronApp.meteorAppIndex, indexHtml);
                this.log.info('successfully downloaded index.html from running meteor app');
            } catch (e) {
                this.log.error('error while trying to download index.html for web.cordova, ' +
                    'be sure that you are running a mobile target or with' +
                    ' --mobile-server: ', e);
                throw e;
            }
        }

        const cordovaBuild = this.$.env.paths.meteorApp[prefix];
        const cordovaBuildIndex = this.$.env.paths.meteorApp.cordovaBuildIndex;
        const cordovaBuildProgramJson = this.$.env.paths.meteorApp[`${prefix}ProgramJson`];

        if (!this.$.utils.exists(cordovaBuild)) {
            this.log.error(`no mobile build found at ${cordovaBuild}`);
            this.log.error('are you sure you did run meteor with --mobile-server?');
            throw new Error('required file not present');
        }

        if (!this.$.utils.exists(cordovaBuildProgramJson)) {
            this.log.error('no program.json found in mobile build found at ' +
                `${cordovaBuild}`);
            this.log.error('are you sure you did run meteor with --mobile-server?');
            throw new Error('required file not present');
        }

        if (this.indexHTMLstrategy !== this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER) {
            if (!this.$.utils.exists(cordovaBuildIndex)) {
                this.log.error('no index.html found in cordova build found at ' +
                    `${cordovaBuild}`);
                this.log.error('are you sure you did run meteor with --mobile-server?');
                throw new Error('required file not present');
            }
        }

        this.log.verbose('copying mobile build');
        shell.cp(
            '-R', `${cordovaBuild}${copyPathPostfix}`, this.$.env.paths.electronApp.meteorApp
        );

        // Because of various permission problems here we try to clear te path by clearing
        // all possible restrictions.
        shell.chmod(
            '-R', '777', this.$.env.paths.electronApp.meteorApp
        );
        if (this.$.env.os.isWindows) {
            shell.exec(`attrib -r ${this.$.env.paths.electronApp.meteorApp}${path.sep}*.* /s`);
        }

        if (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER) {
            let programJson;
            try {
                programJson = await this.acquireManifest();
                fs.writeFileSync(
                    this.$.env.paths.electronApp.meteorAppProgramJson,
                    JSON.stringify(programJson, null, 4)
                );
                this.log.info('successfully downloaded manifest.json from running meteor app');
            } catch (e) {
                this.log.error('error while trying to download manifest.json for web.cordova,' +
                    ' be sure that you are running a mobile target or with' +
                    ' --mobile-server: ', e);
                throw e;
            }
        }

        this.log.info('mobile build copied to electron app');

        this.log.debug('copy cordova.js to meteor build');
        shell.cp(
            join(__dirname, '..', 'skeleton', 'cordova.js'),
            this.$.env.paths.electronApp.meteorApp
        );
    }

    /**
     * Injects Meteor.isDesktop
     */
    injectIsDesktop() {
        this.log.info('injecting isDesktop');

        let manifestJsonPath = this.$.env.paths.meteorApp.cordovaBuildProgramJson;
        if (this.indexHTMLstrategy === this.indexHTMLStrategies.INDEX_FROM_RUNNING_SERVER) {
            manifestJsonPath = this.$.env.paths.meteorApp.webCordovaProgramJson;
        }

        try {
            const manifest = JSON.parse(
                fs.readFileSync(manifestJsonPath, 'UTF-8')
            ).manifest;
            let injected = false;
            let injectedStartupDidComplete = false;
            let result = null;

            // We will search in every .js file in the manifest.
            // We could probably detect whether this is a dev or production build and only search in
            // the correct files, but for now this should be fine.
            manifest.forEach((file) => {
                let fileContents;
                // Hacky way of setting isDesktop.
                if (file.type === 'js') {
                    fileContents = fs.readFileSync(
                        join(this.$.env.paths.electronApp.meteorApp, file.path),
                        'UTF-8'
                    );
                    result = this.injector.processFileContents(fileContents);

                    fileContents = result.fileContents;
                    injectedStartupDidComplete =
                        result.injectedStartupDidComplete ? true : injectedStartupDidComplete;
                    injected = result.injected ? true : injected;

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
            this.log.error('error occurred while injecting isDesktop: ', e);
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
                    case 'copy':
                        this.log.error(
                            'error encountered when copying the build');
                        break;
                    default:
                        this.log.error('error occurred during building mobile target', reason);
                }
                if (this.mobilePlatform) {
                    await this.removeMobilePlatform(this.mobilePlatform);
                }
                process.exit(1);
            }
        } else {
            this.indexHTMLstrategy = this.chooseStrategy();
            try {
                await this.copyBuild();
            } catch (e) {
                process.exit(1);
            }
        }

        this.injectIsDesktop();

        this.changeDdpUrl();

        try {
            await this.packToAsar();
        } catch (e) {
            this.log.error('error while packing meteor app to asar');
            process.exit(1);
        }

        this.log.info('meteor build finished');

        if (this.mobilePlatform) {
            await this.removeMobilePlatform(this.mobilePlatform);
        }
    }

    changeDdpUrl() {
        if (this.$.env.options.ddpUrl !== null) {
            try {
                this.updateDdpUrl(this.$.env.paths.electronApp.meteorAppIndex);
            } catch (e) {
                this.log.error(`error while trying to change the ddp url: ${e.message}`);
            }
        }
    }

    packToAsar() {
        this.log.info('packing meteor app to asar archive');
        return new Promise((resolve, reject) =>
            asar.createPackage(
                this.$.env.paths.electronApp.meteorApp,
                path.join(this.$.env.paths.electronApp.root, 'meteor.asar'),
                () => {
                    // On Windows some files might still be blocked. Giving a tick for them to be
                    // ready for deletion.
                    setImmediate(() => {
                        this.log.verbose('clearing meteor app after packing');
                        this.$.utils
                            .rmWithRetries('-rf', this.$.env.paths.electronApp.meteorApp)
                            .then(() => {
                                resolve();
                            })
                            .catch((e) => {
                                reject(e);
                            });
                    });
                }
            )
        );
    }
}
