/**
 * Adds the entity name for log messages.
 *
 * @param {string} entityName     - Class name.
 * @param {Object} loggerInstance - Instance of the logger.
 */
function logger(entityName, loggerInstance) {

    /**
     * Logs message.
     *
     * @param {string} level   - Level such as debug/info/error...
     * @param {string} message - Message to log.
     */
    this.log = function log(level, message) {
        loggerInstance[level]('[' + entityName + '] ' + message);
    };

    /**
     * Returns the bare logger.
     *
     * @returns {Object}
     */
    this.getUnwrappedLogger = function getUnwrappedLogger() {
        return loggerInstance;
    };
}

module.exports = logger;
