'use strict';

/**
 * Until we would have a `web.desktop` arch in Meteor we need to provide a way to distinguish
 * the desktop specific code. The easiest approach is to have a Meteor.isDesktop. Since we do not
 * want the `Meteor.isCordova` to be true we just replace it with `isDesktop`.
 * Also we need to change the faulty version check procedure to fire on desktop architecture.
 */

class IsDesktopInjector {

    constructor() {
        this.startupDidCompleteRegEx =
            new RegExp('\\((\\w+.)(isCordova)\\)([\\S\\s]*?)(startupDidComplete)', 'gm');
        this.startupDidCompleteProductionRegEx =
            new RegExp('(\\w+.)(isCordova)(&&\\w*\\.)(startupDidComplete)', 'gm');
    }
    /**
     * Searches for and replaces two places in Meteor app:
     *  - where `isCordova` is set to true
     *  - where `startupDidComplete` is fired
     *
     * @param {string} contents
     * @returns {{fileContents: *, injectedStartupDidComplete: boolean, injected: boolean}}
     */
    processFileContents(contents) {
        // This searches for the place where `startupDidComplete` is fired. We need that now to be
        // fired when `isDesktop` is set.

        let injectedStartupDidComplete = false;
        let injected = false;
        let fileContents = contents;

        // This changes the place where `isCordova` is set to true.
        fileContents = fileContents.replace('.isCordova=!0', '.isDesktop=!0');
        fileContents = fileContents.replace('.isCordova = true', '.isDesktop = true');


        if (this.startupDidCompleteRegEx.test(fileContents) ||
            this.startupDidCompleteProductionRegEx.test(fileContents)) {

            this.startupDidCompleteProductionRegEx.lastIndex = 0;
            this.startupDidCompleteRegEx.lastIndex = 0;

            fileContents = fileContents.replace(
                this.startupDidCompleteRegEx,
                '($1isDesktop)$3$4');

            fileContents = fileContents.replace(
                this.startupDidCompleteProductionRegEx,
                '$1isDesktop$3$4');

            injectedStartupDidComplete = true;
        }

        if (~fileContents.indexOf('.isDesktop=!0') ||
            ~fileContents.indexOf('.isDesktop = true')) {
            injected = true;
        }
        return {
            fileContents,
            injectedStartupDidComplete,
            injected
        };
    }
}

module.exports = IsDesktopInjector;
