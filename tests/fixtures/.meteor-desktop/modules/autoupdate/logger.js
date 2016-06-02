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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1vZHVsZXMvYXV0b3VwZGF0ZS9sb2dnZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBTUEsU0FBUyxNQUFULENBQWdCLFVBQWhCLEVBQTRCLGNBQTVCLEVBQTRDOzs7Ozs7OztBQVF4QyxTQUFLLEdBQUwsR0FBVyxTQUFTLEdBQVQsQ0FBYSxLQUFiLEVBQW9CLE9BQXBCLEVBQTZCO0FBQ3BDLHVCQUFlLEtBQWYsRUFBc0IsTUFBTSxVQUFOLEdBQW1CLElBQW5CLEdBQTBCLE9BQWhEO0FBQ0gsS0FGRDs7Ozs7OztBQVNBLFNBQUssa0JBQUwsR0FBMEIsU0FBUyxrQkFBVCxHQUE4QjtBQUNwRCxlQUFPLGNBQVA7QUFDSCxLQUZEO0FBR0g7O0FBRUQsT0FBTyxPQUFQLEdBQWlCLE1BQWpCIiwiZmlsZSI6Im1vZHVsZXMvYXV0b3VwZGF0ZS9sb2dnZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogQWRkcyB0aGUgZW50aXR5IG5hbWUgZm9yIGxvZyBtZXNzYWdlcy5cclxuICpcclxuICogQHBhcmFtIHtzdHJpbmd9IGVudGl0eU5hbWUgICAgIC0gQ2xhc3MgbmFtZS5cclxuICogQHBhcmFtIHtPYmplY3R9IGxvZ2dlckluc3RhbmNlIC0gSW5zdGFuY2Ugb2YgdGhlIGxvZ2dlci5cclxuICovXHJcbmZ1bmN0aW9uIGxvZ2dlcihlbnRpdHlOYW1lLCBsb2dnZXJJbnN0YW5jZSkge1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogTG9ncyBtZXNzYWdlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBsZXZlbCAgIC0gTGV2ZWwgc3VjaCBhcyBkZWJ1Zy9pbmZvL2Vycm9yLi4uXHJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbWVzc2FnZSAtIE1lc3NhZ2UgdG8gbG9nLlxyXG4gICAgICovXHJcbiAgICB0aGlzLmxvZyA9IGZ1bmN0aW9uIGxvZyhsZXZlbCwgbWVzc2FnZSkge1xyXG4gICAgICAgIGxvZ2dlckluc3RhbmNlW2xldmVsXSgnWycgKyBlbnRpdHlOYW1lICsgJ10gJyArIG1lc3NhZ2UpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybnMgdGhlIGJhcmUgbG9nZ2VyLlxyXG4gICAgICpcclxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9XHJcbiAgICAgKi9cclxuICAgIHRoaXMuZ2V0VW53cmFwcGVkTG9nZ2VyID0gZnVuY3Rpb24gZ2V0VW53cmFwcGVkTG9nZ2VyKCkge1xyXG4gICAgICAgIHJldHVybiBsb2dnZXJJbnN0YW5jZTtcclxuICAgIH07XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gbG9nZ2VyO1xyXG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
