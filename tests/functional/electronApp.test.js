import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import fs from 'fs';
import shell from 'shelljs';
import asar from 'asar';

import { createTestInstance, StubLog, getModuleJson, saveModuleJson } from '../helpers/meteorDesktop';
import paths from '../helpers/paths';

chai.use(sinonChai);
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;

describe('electronApp', () => {
    let MeteorDesktop;

    beforeEach(() => {
        MeteorDesktop = createTestInstance();
    });

    describe('#packDesktopToAsar', () => {
        it('should make desktop.asar from .desktop', (done) => {
            shell.cp('-rf', paths.fixtures.desktop, paths.testProjectInstallPath);
            shell.mkdir(MeteorDesktop.env.paths.electronApp.root);
            const logStub = new StubLog(MeteorDesktop.electronApp, 'info');
            MeteorDesktop.electronApp.copyDesktopToDesktopTemp();
            MeteorDesktop.electronApp.packDesktopToAsar().then(() => {
                expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.desktopAsar)).to.be.true();
                const files = asar.listPackage(MeteorDesktop.env.paths.electronApp.desktopAsar);
                expect(files).to.include.members(
                    ['\\desktop.js', '\\settings.json', '\\modules', '\\assets']);
                logStub.restore();
                done();
            }).catch((e) => { done(e); logStub.restore(); });
        });
    });
    describe('#updatePackageJsonFields', () => {
        it('should update fields according to settings.packageJsonFields', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.testProjectInstallPath);
            shell.mkdir(MeteorDesktop.env.paths.electronApp.root);
            const logStub = new StubLog(MeteorDesktop.electronApp, 'info');
            MeteorDesktop.electronApp.updatePackageJsonFields();
            const packageJson = JSON.parse(
                fs.readFileSync(MeteorDesktop.env.paths.electronApp.packageJson, 'UTF-8')
            );
            expect(packageJson.description).to.be.equal('My Meteor App');
            expect(packageJson.private).to.be.true();
            expect(packageJson.author).to.be.equal('Me, Myself And I');
            expect(packageJson.name).to.be.equal('MyMeteorApp');
            logStub.restore();
        });
    });

    describe('#updateDependencies', () => {
        it('should update dependencies list', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.testProjectInstallPath);
            shell.mkdir(MeteorDesktop.env.paths.electronApp.root);
            const logStub = new StubLog(MeteorDesktop.electronApp, 'info');
            MeteorDesktop.electronApp.packageJson = {};
            MeteorDesktop.electronApp.updateDependenciesList();
            const packageJson = JSON.parse(
                fs.readFileSync(MeteorDesktop.env.paths.electronApp.packageJson, 'UTF-8')
            );
            expect(packageJson.dependencies).to.have.a.property('some-package', '1.2.3');
            expect(packageJson.dependencies).to.have.a.property(
                'meteor-desktop-splash-screen', '0.0.22');
            expect(packageJson.dependencies).to.have.a.property('dependency', '1.0.1');
            expect(packageJson.dependencies).to.have.a.property('dependency2', '0.0.5');
            logStub.restore();
        });


        function testUpdateDependenciesError(module, dependency, version, match) {
            shell.cp('-rf', paths.fixtures.desktop, paths.testProjectInstallPath);
            const moduleJson = getModuleJson(module);
            moduleJson.dependencies[dependency] = version;
            saveModuleJson(module, moduleJson);
            const logStub = new StubLog(MeteorDesktop.electronApp, ['error', 'info'], true);
            MeteorDesktop.electronApp.packageJson = {};
            MeteorDesktop.electronApp.updateDependenciesList();
            expect(logStub.stubs.error).to.have.been.calledWithMatch(
                sinon.match(match)
            );
            logStub.restore();
        }

        it('should report error on dependency version range', () => {
            testUpdateDependenciesError('someModule', 'someDep', '^1.2.0', /version range/);
        });
        it('should report error on dependency conflict', () => {
            testUpdateDependenciesError(
                'someModule2', 'dependency', '0.2.0', /found to be conflicting/
            );
        });
        it('should report error dependency conflict with core', () => {
            testUpdateDependenciesError(
                'someModule', 'shelljs', '0.2.0', /found to be conflicting/
            );
        });
    });
});
