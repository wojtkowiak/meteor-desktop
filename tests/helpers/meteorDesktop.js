/* eslint-disable no-console */

import sinon from 'sinon';
import path from 'path';
import fs from 'fs';
import shell from 'shelljs';

import meteorDesktop from '../../dist/index';
import paths from './paths';

export function StubLog(object, methods, stubProcessExit) {
    const stubs = {};

    const methodsArray = Array.isArray(methods) ? methods : [methods];

    if (stubProcessExit) {
        sinon.stub(process, 'exit');
    }

    methodsArray.forEach((method) => {
        stubs[method] = sinon.stub(object.log, method);
    });

    this.restore = () => {
        Object.keys(stubs).forEach(method => stubs[method].restore());
        if (stubProcessExit) {
            process.exit.restore();
        }
    };

    this.stubs = stubs;

    return this;
}

export function createTestInstance() {
    shell.rm('-rf', paths.testsTmpPath);

    // Copy test meteor app.
    shell.mkdir('-p', paths.testsTmpPath);
    shell.mkdir(paths.testProjectInstallPath);
    shell.cp('-r', paths.fixtures.testProject, paths.testsTmpPath);

    return meteorDesktop(
        paths.testProjectInstallPath,
        paths.testProjectInstallPath,
        { ddpUrl: 'http://127.0.0.1:3788' },
        {
            log: class {
                constructor() {
                    this.info = sinon.stub();
                    this.error = (...args) => console.error(args);
                }
            }
        }
    );
}

class Logger {
    constructor(show, showErrors) {
        this.show = show;
        this.showErrors = showErrors;
        this.loggers = {
            get: () => new Logger(show, showErrors)
        };
    }

    info(...args) {
        if (this.show) {
            console.log(...args);
        }
    }

    verbose(...args) {
        if (this.show) {
            console.log(...args);
        }
    }

    debug(...args) {
        if (this.show) {
            console.log(...args);
        }
    }

    warn(...args) {
        if (this.show) {
            console.warn(...args);
        }
    }

    error(...args) {
        if (this.show || this.showErrors) {
            console.error(...args);
        }
    }

    getLoggerFor() {
        return new Logger(this.show, this.showErrors);
    }
}

export function getFakeLogger(show, showErrors) {
    return new Logger(show, showErrors);
}

export function getModuleJson(module) {
    const moduleJsonPath = path.join(
        paths.testProjectInstallPath, '.desktop', 'modules', module, 'module.json'
    );
    return JSON.parse(fs.readFileSync(moduleJsonPath, 'UTF-8'));
}

export function saveModuleJson(module, moduleJson) {
    const moduleJsonPath = path.join(
        paths.testProjectInstallPath, '.desktop', 'modules', module, 'module.json'
    );
    fs.writeFileSync(
        moduleJsonPath, JSON.stringify(moduleJson, null, 2)
    );
}

export default function (input, output, options) {
    return meteorDesktop(input, output, options);
}
