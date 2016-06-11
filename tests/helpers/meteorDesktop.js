import meteorDesktop from '../../dist/index';
import shell from 'shelljs';
import paths from './paths';
import sinon from 'sinon';
import path from 'path';
import fs from 'fs';

export function stubLog(object, methods, stubProcessExit) {
    const stubs = {};

    const methodsArray = Array.isArray(methods) ? methods : [methods];

    if (stubProcessExit) {
        sinon.stub(process, 'exit');
    }

    methodsArray.forEach(method => {
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
    shell.mkdir(paths.fixtures.testProjectInstall);
    shell.cp('-r', paths.fixtures.testProject, paths.testsTmpPath);

    return meteorDesktop(
        paths.fixtures.testProjectInstall,
        paths.fixtures.testProjectInstall,
        { ddpUrl: 'http://127.0.0.1:3000' },
        {
            log: class {
                constructor() {
                    this.info = sinon.stub();
                }
            }
        }
    );
}

export function getModuleJson(module) {
    const moduleJsonPath = path.join(
        paths.fixtures.testProjectInstall, '.desktop', 'modules', module, 'module.json'
    );
    return JSON.parse(fs.readFileSync(moduleJsonPath, 'UTF-8'));
}

export function saveModuleJson(module, moduleJson) {
    const moduleJsonPath = path.join(
        paths.fixtures.testProjectInstall, '.desktop', 'modules', module, 'module.json'
    );
    fs.writeFileSync(
        moduleJsonPath, JSON.stringify(moduleJson, null, 2)
    );
}

export default function (input, output, options) {
    return meteorDesktop(input, output, options);
}
