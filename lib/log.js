/* eslint-disable no-console */
/*
 0.OFF
 1.INFO
 2.WARN
 3.ERROR
 4.TRACE
 5.DEBUG
 6.ALL
 */

export default class Log {
    constructor(prefix) {
        this.prefix = prefix;
    }

    static level() {
        return process.env.MD_LOG_LEVEL || 'INFO,WARN,ERROR';
    }

    static slice(args) {
        return Array.prototype.slice.call(args, 0);
    }

    log(type, args) {
        console.log.apply(null, [`${type}  ${this.prefix}: `].concat(Log.slice(args)));
    }

    info(...args) {
        if (/INFO|ALL/i.test(Log.level())) {
            this.log('INFO', args);
        }
    }

    warn(...args) {
        if (/WARN|ALL/i.test(Log.level())) {
            this.log('WARN', args);
        }
    }

    error(...args) {
        if (/ERROR|ALL/i.test(Log.level())) {
            this.log('ERROR', args);
        }
    }

    debug(...args) {
        if (/DEBUG|ALL/i.test(Log.level())) {
            this.log('DEBUG', args);
        }
    }

    trace(...args) {
        if (/TRACE|ALL/i.test(Log.level())) {
            this.log('TRACE', args);
        }
    }
}
