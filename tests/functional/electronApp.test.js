import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import path from 'path';
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
    let logStub;

    beforeEach(() => {
        MeteorDesktop = createTestInstance();
        shell.cp('-rf', paths.fixtures.desktop, paths.testProjectInstallPath);
        shell.mkdir(MeteorDesktop.env.paths.electronApp.root);
        logStub = new StubLog(MeteorDesktop.electronApp, 'info');
    });

    afterEach(() => {
        logStub.restore();
        shell.rm('-rf', paths.testProjectInstallPath);
    });

    describe('#packDesktopToAsar', () => {
        it('should make desktop.asar from .desktop', (done) => {
            MeteorDesktop.electronApp.copyDesktopToDesktopTemp();
            MeteorDesktop.electronApp.packDesktopToAsar().then(() => {
                expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.desktopAsar)).to.be.true();
                const files = asar.listPackage(MeteorDesktop.env.paths.electronApp.desktopAsar);
                const expected = ['desktop.js', 'settings.json', 'modules', 'assets'];
                expect(files).to.include.members(
                    expected.map(expectedPath => path.sep + expectedPath));
                done();
            }).catch((e) => { done(e); });
        });
    });

    describe('#updatePackageJsonFields', () => {
        it('should update fields according to settings.packageJsonFields', () => {
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
            MeteorDesktop.electronApp.packageJson = {};
            MeteorDesktop.electronApp.updateDependenciesList();
            const packageJson = JSON.parse(
                fs.readFileSync(MeteorDesktop.env.paths.electronApp.packageJson, 'UTF-8')
            );
            expect(packageJson.dependencies).to.have.a.property('some-package', '1.2.3');
            expect(packageJson.dependencies).to.have.a.property(
                'meteor-desktop-splash-screen', '0.2.0');
            expect(packageJson.dependencies).to.have.a.property('dependency', '1.0.1');
            expect(packageJson.dependencies).to.have.a.property('dependency2', '0.0.5');
        });


        function testUpdateDependenciesError(module, dependency, version, match) {
            logStub.restore();
            logStub = new StubLog(MeteorDesktop.electronApp, ['info'], true);
            const moduleJson = getModuleJson(module);
            moduleJson.dependencies[dependency] = version;
            saveModuleJson(module, moduleJson);
            MeteorDesktop.electronApp.packageJson = {};
            MeteorDesktop.electronApp.updatePackageJsonFields();
            try {
                MeteorDesktop.electronApp.updateDependenciesList();
            } catch (e) {
                expect(e.message).to.match(match);
            }
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
