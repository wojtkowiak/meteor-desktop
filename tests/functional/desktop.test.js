import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import fs from 'fs';
import path from 'path';
import shell from 'shelljs';
import mockery from 'mockery';

import paths from '../helpers/paths';
import mockerySettings from '../helpers/mockerySettings';

chai.use(sinonChai);
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;

const Electron = {};

const meteorDesktop = require('../helpers/meteorDesktop');

const {
    createTestInstance, StubLog, getModuleJson, saveModuleJson
} = meteorDesktop;

describe('desktop', () => {
    let MeteorDesktop;

    before(() => {
        mockery.registerMock('electron', Electron);
        mockery.enable(mockerySettings);
    });

    after(() => {
        mockery.deregisterMock('electron');
        mockery.disable();
    });

    beforeEach(() => {
        MeteorDesktop = createTestInstance();
    });

    describe('#getSettings', () => {
        it('should read settings.json', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.testProjectInstallPath);
            const settings = MeteorDesktop.desktop.getSettings();
            expect(settings).to.have.a.property('window');
            expect(settings).to.have.a.property('packageJsonFields');
        });

        it('should report error on missing file', () => {
            const logStub = new StubLog(MeteorDesktop.desktop, ['error']);
            sinon.stub(process, 'exit');
            MeteorDesktop.desktop.getSettings();
            expect(logStub.stubs.error).to.have.been.calledOnce();
            logStub.restore();
            process.exit.restore();
        });
    });

    describe('#getHashSettings', () => {
        it('should read settings.json', async () => {
            const logStub = new StubLog(MeteorDesktop.desktop, ['info']);
            MeteorDesktop.env.paths.desktop.root = paths.fixtures.desktop;
            const version = await MeteorDesktop.desktop.getHashVersion();
            expect(version).to.be.equal('c18b45f899ee04cea7f5704e98d88d9ecf0239b9');
            logStub.restore();
        });
    });

    describe('#getModuleConfig', () => {
        it('should report error on missing module.json', () => {
            const logStub = new StubLog(MeteorDesktop.desktop, ['error'], true);
            MeteorDesktop.desktop.getModuleConfig('nonExistingModule');
            expect(logStub.stubs.error).to.have.been.calledWithMatch(
                sinon.match(/error while trying to read/)
            );
            logStub.restore();
        });

        it('should report error on missing name field in module.json', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.testProjectInstallPath);
            const moduleJson = getModuleJson('someModule');
            delete moduleJson.name;
            saveModuleJson('someModule', moduleJson);
            const logStub = new StubLog(MeteorDesktop.desktop, ['error'], true);
            MeteorDesktop.desktop.getModuleConfig(
                path.join(paths.testProjectInstallPath, '.desktop', 'modules', 'someModule')
            );
            expect(logStub.stubs.error).to.have.been.calledWithMatch(
                sinon.match(/field defined in/)
            );
            logStub.restore();
        });
    });
    describe('#scaffold', () => {
        it('should create .desktop scaffold', () => {
            const logStub = new StubLog(MeteorDesktop.desktop, ['info']);
            MeteorDesktop.desktop.scaffold();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.root)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.settings)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.desktop)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.assets)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.splashScreen)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.loadingGif)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.meteorIco)).to.be.true();
            logStub.restore();
        });

        it('should warn about .desktop that already exists', () => {
            shell.mkdir(MeteorDesktop.env.paths.desktop.root);
            const logStub = new StubLog(MeteorDesktop.desktop, ['info', 'warn']);
            MeteorDesktop.desktop.scaffold();
            expect(logStub.stubs.warn).to.have.been.calledOnce();
            logStub.restore();
        });
    });

    describe('#getDependencies', () => {
        it('should get all dependencies from .desktop', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.testProjectInstallPath);
            const deps = MeteorDesktop.desktop.getDependencies();
            expect(deps).to.deep.equal({
                fromSettings: { 'some-package': '1.2.3' },
                plugins: {
                    'meteor-desktop-splash-screen': '0.3.0',
                    'meteor-desktop-localstorage': '0.0.11'
                },
                modules: {
                    someModule: { dependency: '1.0.1' },
                    someModule2: { dependency2: '0.0.5' }
                }
            });
        });

        it('report error on duplicated module name', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.testProjectInstallPath);
            const moduleJson = getModuleJson('someModule');
            moduleJson.name = 'someModule2';
            saveModuleJson('someModule', moduleJson);
            const logStub = new StubLog(MeteorDesktop.desktop, ['error'], true);
            MeteorDesktop.desktop.getDependencies();
            expect(logStub.stubs.error).to.have.been.calledWithMatch(
                sinon.match(/already registered/)
            );
            logStub.restore();
        });
    });
});
