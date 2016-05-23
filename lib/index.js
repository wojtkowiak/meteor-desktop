/**
 * Main entity.
 *
 * @param {string} input - Meteor app dir.
 * @param {string} output - Output dir for bundle/package/installer.
 * @constructor
 */
function MeteorDesktop(input, output, runFromDist) {
    this.log = require('./log')(this, 'index');

    this.log.info('initializing');

    this.env = require('./env')();

    this.scaffold = require('./scaffold')(this);
    this.electron = require('./electron')(this);
    this.app = require('./app')(this, runFromDist);
}

/**
 * Runs callbacks in a waterfall.
 * @param {Function[]} methods - Array of callbacks.
 */
MeteorDesktop.prototype.waterfall = function waterfall(methods) {
    var self = this;
    var method = methods.shift();
    method[0].apply(method[1], [function callNext() {
        if (methods.length) {
            self.waterfall(methods);
        }
    }]);
};

module.exports = function exports(input, output, settings) {
    return new MeteorDesktop(input, output, settings);
};
