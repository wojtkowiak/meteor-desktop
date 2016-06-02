import Log from './log';
import fs from 'fs';
import spawn from 'cross-spawn';

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
            this.log.warn('no mobile target detected - will add `android` just to get a mobile build');
            await this.addMobilePlatform();
        }
    }

    addMobilePlatform() {
        return new Promise((resolve, reject) => {
            spawn('meteor', ['add-platform', 'android'], {
                cwd: this.$.env.paths.electronApp.root,
                stdio: this.$.env.stdio
            }).on('exit', (code) => {
                resolve();
            });
        });
    }

    async build() {
        await this.checkPreconditions();
        spawn('meteor', ['add-platform', 'android'], {
            cwd: this.$.env.paths.electronApp.root,
            stdio: this.$.env.stdio
        }).on('exit', (code) => {
            resolve();
        });
    }


}


module.exports = MeteorApp;

