/**
 * Main entity.
 */
class MeteorDesktop {

    /**
     * @param {string} input - Meteor app dir.
     * @param {string} output - Output dir for bundle/package/installer.
     * @param {bool} runFromDist
     * @constructor
     */
    constructor(input, output, runFromDist) {
        this.log = require('./log')(this, 'index');

        this.log.info('initializing', input, output);

        this.env = require('./env')(input, output);
        this.scaffold = require('./scaffold')(this);
        this.electron = require('./electron')(this);
        this.app = require('./app')(this, runFromDist);
    }

    /**
     * Runs callbacks in a waterfall.
     * @param {Function[]} methods - Array of callbacks.
     */
    waterfall(methods) {
        var self = this;
        var method = methods.shift();
        method[0].apply(method[1], [function callNext() {
            if (methods.length) {
                self.waterfall(methods);
            }
        }]);
    };
}


module.exports = function exports(input, output, settings) {
    return new MeteorDesktop(input, output, settings);
};
