import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import fs from 'fs';
import path from 'path';
import shell from 'shelljs';
import mockery from 'mockery';

shell.config.fatal = true;

import paths from '../helpers/paths';

chai.use(sinonChai);
chai.use(dirty);
const {describe, it} = global;
const {expect} = chai;

//const meteorDesktop = require('../helpers/meteorDesktop');

import meteorDesktop from '../../lib/index';

/*const {
    createTestInstance, StubLog, getModuleJson, saveModuleJson
} = meteorDesktop;*/

let appDir = '';

describe('desktop', () => {
    let MeteorDesktop;

    before((done) => {
        //shell.mkdir('-p', paths.testsTmpPath);
        console.log('create');
        //shell.exec('meteor create test-desktop --release=METEOR@1.4.1.3', { cwd:
        // paths.testsTmpPath });
        appDir = path.join(paths.testsTmpPath, 'test-desktop');
        /*
        const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..',
         'package.json'), 'utf8'));

        const packages = Object.keys(packageJson.dependencies).map((dep) => `${dep}@${packageJson.dependencies[dep]}`).join(' ');
        console.log(`npm install ${packages}`);
        // NYC seems to mess with executing `npm install` or `meteor npm install` so we are
        // pointing directly to npm-cli.js as a workaround.
        const npmPath = path.join(appDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
        shell.exec(`node ${npmPath} install ${packages}`, { cwd: appDir });
        console.log('done npm');*/
        done();
    });

    beforeEach(() => {
        //MeteorDesktop = createTestInstance();
    });

    describe('add to scripts', () => {
        it('should add a `desktop` entry in package.json', (done) => {
            const exitStub = sinon.stub(process, 'exit');
            require('../../lib/scripts/addToScripts');
            const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
            expect(packageJson.scripts.desktop).to.be.equal('meteor-desktop');
            expect(exitStub).to.not.be.called();
            exitStub.restore();
            done();
        });
    });

    describe('add to scripts', () => {
        it('should create a build', async () => {
            MeteorDesktop = meteorDesktop(
                appDir,
                appDir,
                { ddpUrl: 'http://127.0.0.1:3788', init: true, build: true }
            );
            await MeteorDesktop.build();
        }).timeout(10 * 60000);
    });



});
