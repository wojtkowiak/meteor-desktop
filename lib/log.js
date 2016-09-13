/*
 0.OFF
 1.INFO
 2.WARN
 3.ERROR
 4.TRACE
 5.DEBUG
 6.ALL
 */

class Logger {

    prefix;

    constructor(prefix) {
        this.prefix = prefix;
    }

    static level() {
        return process.env.MEDC_LOG_LEVEL || 'INFO,WARN,ERROR';
    }

    static slice(args) {
        return Array.prototype.slice.call(args, 0);
    }

    log(type, args) {
        console.log.apply(null, [`${type}  ${this.prefix}: `].concat(Logger.slice(args)));
    }

    info() {
        if (/INFO|ALL/i.test(Logger.level())) {
            this.log('INFO', arguments);
        }
    }

    warn() {
        if (/WARN|ALL/i.test(Logger.level())) {
            this.log('WARN', arguments);
        }
    }

    error() {
        if (/ERROR|ALL/i.test(Logger.level())) {
            this.log('ERROR', arguments);
        }
    }

    debug() {
        if (/DEBUG|ALL/i.test(Logger.level())) {
            this.log('DEBUG', arguments);
        }
    }

    trace() {
        if (/TRACE|ALL/i.test(Logger.level())) {
            this.log('TRACE', arguments);
        }
    }

}
module.exports = function exports(prefix) {
    return new Logger(prefix);
};
