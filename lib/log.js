/*
 0.OFF
 1.INFO
 2.WARN
 3.ERROR
 4.TRACE
 5.DEBUG
 6.ALL
 */

function level() {
    return process.env.MDC_LOG_LEVEL || 'INFO,WARN,ERROR';
}

function slice(args) {
    return Array.prototype.slice.call(args, 0);
}

function log(prefix, type, args) {
    console.log.apply(null, [type + '  ' + prefix + ': '].concat(args));
}

function Log($, prefix) {
    this.$ = $;
    this.prefix = prefix;
}

Log.prototype.info = function info() {
    if (/INFO|ALL/i.test(level())) {
        log(this.prefix, 'INFO', slice(arguments));
    }
};

Log.prototype.warn = function warn() {
    if (/WARN|ALL/i.test(level())) {
        log(this.prefix, 'WARN', slice(arguments));
    }
};

Log.prototype.error = function error() {
    if (/ERROR|ALL/i.test(level())) {
        log(this.prefix, 'ERROR', slice(arguments));
    }
};

Log.prototype.debug = function debug() {
    if (/DEBUG|ALL/i.test(level())) {
        log(this.prefix, 'DEBUG', slice(arguments));
    }
};

Log.prototype.trace = function trace() {
    if (/TRACE|ALL/i.test(level())) {
        log(this.prefix, 'TRACE', slice(arguments));
    }
};

module.exports = function exports($, prefix) {
    return new Log($, prefix);
};
