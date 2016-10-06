import winston from 'winston';
import { join } from 'path';

export default class LoggerManager {
    /**
     * @param {App} $ - context.
     */
    constructor($) {
        // Default Winston transports.
        this.fileLogConfiguration = {
            level: 'debug',
            filename: join($.userDataDir, 'run.log'),
            handleExceptions: false,
            json: false,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            colorize: false
        };
        this.consoleLogConfiguration = {
            level: 'debug',
            handleExceptions: false,
            json: false,
            colorize: true
        };

        this.loggerTransports = [
            new (winston.transports.Console)(this.consoleLogConfiguration),
            new (winston.transports.File)(this.fileLogConfiguration)
        ];

        this.configureLogger();
        this.setDefaultTransports();
    }

    static getMainLogger() {
        return winston.loggers.get('main');
    }

    setDefaultTransports() {
        winston.loggers.options.transports = this.loggerTransports;
    }

    /**
     * Returns a new logger instance.
     * @param {string} entityName
     * @returns {Log}
     */
    configureLogger(entityName = 'main') {
        winston.loggers.add(entityName, {});

        const logger = winston.loggers.get(entityName);
        if (entityName !== 'main') {
            logger.add(winston.transports.File, {
                level: 'debug',
                name: entityName,
                handleExceptions: false,
                filename: join(this.userDataDir, `${entityName}.log`)
            });
        } else {
            const fileLogConfiguration = {};
            Object.assign(
                fileLogConfiguration,
                this.fileLogConfiguration,
                { handleExceptions: true }
            );
            const consoleLogConfiguration = {};
            Object.assign(
                consoleLogConfiguration,
                this.consoleLogConfiguration,
                { handleExceptions: true }
            );
            logger.add(winston.transports.File, fileLogConfiguration);
            logger.add(winston.transports.Console, consoleLogConfiguration);
        }

        logger.filters.push((level, msg) => `[${entityName}] ${msg}`);
        logger.entityName = entityName;

        logger.getLoggerFor = (subEntityName) => {
            if (!winston.loggers.loggers[`${logger.entityName}__${subEntityName}`]) {
                winston.loggers.add(`${logger.entityName}__${subEntityName}`, {});
                const newLogger = winston.loggers.get(`${logger.entityName}__${subEntityName}`);
                newLogger.filters.push((level, msg) => `[${logger.entityName}] [${subEntityName}] ${msg}`);
                newLogger.getLoggerFor = logger.getLoggerFor;
                return newLogger;
            }
            return winston.loggers.get(`${logger.entityName}__${subEntityName}`);
        }
    }
}
