import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
chai.use(sinonChai);
chai.use(dirty);
import sinon from 'sinon';
const { describe, it } = global;
const { expect } = chai;
import { createTestInstance } from '../helpers/meteorDesktop';
import fs from 'fs';
import shell from 'shelljs';
import paths from '../helpers/paths';


describe('electronApp', () => {
    let MeteorDesktop;

    beforeEach(() => {
        MeteorDesktop = createTestInstance();
    });

    describe('#copyFilesFromDesktop', () => {
        it('should copy certain files from .desktop', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.fixtures.testProjectInstall);
            shell.cp('-rf', paths.fixtures.electronApp, paths.fixtures.testProjectInstall);
            MeteorDesktop.electronApp.copyFilesFromDesktop();
            expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.index)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.assets)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.settings)).to.be.true();
        });
    });
    describe('#updatePackageJsonFields', () => {
        it('should update fields according to settings.packageJsonFields', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.fixtures.testProjectInstall);
            shell.cp('-rf', paths.fixtures.electronApp, paths.fixtures.testProjectInstall);
            MeteorDesktop.electronApp.updatePackageJsonFields();
            const packageJson = JSON.parse(
                fs.readFileSync(MeteorDesktop.env.paths.electronApp.packageJson, 'UTF-8')
            );
            expect(packageJson.description).to.be.equal('My Meteor App');
            expect(packageJson.private).to.be.true();
        });
    });
    describe('#updateDependencies', () => {
        it('should update dependencies list', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.fixtures.testProjectInstall);
            shell.cp('-rf', paths.fixtures.electronApp, paths.fixtures.testProjectInstall);
            MeteorDesktop.electronApp.packageJson = {};
            MeteorDesktop.electronApp.updateDependencies();
            const packageJson = JSON.parse(
                fs.readFileSync(MeteorDesktop.env.paths.electronApp.packageJson, 'UTF-8')
            );
            expect(packageJson.dependencies).to.have.a.property('some-package', '1.2.3');
            expect(packageJson.dependencies).to.have.a.property('meteor-desktop-splash-screen', '0.0.2');
            expect(packageJson.dependencies).to.have.a.property('dependency', '1.0.1');
            expect(packageJson.dependencies).to.have.a.property('dependency2', '0.0.5');

        });
    });
});
