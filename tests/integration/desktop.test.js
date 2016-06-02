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
import path from 'path';
import shell from 'shelljs';
import paths from '../helpers/paths';

describe('desktop', () => {
    let MeteorDesktop;

    beforeEach(() => {
        MeteorDesktop = createTestInstance();
    });

    describe('#init', () => {
        it('should create .desktop scaffold', () => {
            MeteorDesktop.app.init();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.root)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.settings)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.index)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.assets)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.desktop.splashScreen)).to.be.true();
        });

        it('should warn about .desktop that already exists', () => {
            shell.mkdir(MeteorDesktop.env.paths.desktop.root);
            sinon.spy(MeteorDesktop.app._log, 'warn');
            MeteorDesktop.app.init();
            expect(MeteorDesktop.app._log.warn).to.have.been.calledOnce();
            MeteorDesktop.app._log.warn.restore();
        });
    });

    describe('#mergeDependencies', () => {
        it('should get all dependencies from .desktop', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.fixtures.testProjectInstall);
            const deps = MeteorDesktop.desktop.mergeDependencies(
                MeteorDesktop.electronApp.scaffold.getDefaultPackageJson().dependencies
            );
            expect(deps).to.have.a.property('dependency', '0.0.5');
            expect(deps).to.have.a.property('dependency2', '1.0.1');
        });

        it('should throw on dependency range', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.fixtures.testProjectInstall);
            const moduleJsonPath = path.join(paths.fixtures.testProjectInstall, '.desktop', 'modules', 'someModule', 'module.json');
            const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'UTF-8'));
            moduleJson.dependencies.someDep = '^1.2.0';
            fs.writeFileSync(
                moduleJsonPath, JSON.stringify(moduleJson, null, 2)
            );
            expect(() => {
                const deps = MeteorDesktop.desktop.mergeDependencies(
                    MeteorDesktop.electronApp.scaffold.getDefaultPackageJson().dependencies
                );
            }).to.throw(/version range/);
        });

        it('should throw on dependency conflict', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.fixtures.testProjectInstall);
            const moduleJsonPath = path.join(paths.fixtures.testProjectInstall, '.desktop', 'modules', 'someModule', 'module.json');
            const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'UTF-8'));
            moduleJson.dependencies.dependency = '0.2.0';
            fs.writeFileSync(
                moduleJsonPath, JSON.stringify(moduleJson, null, 2)
            );
            expect(() => {
                const deps = MeteorDesktop.desktop.mergeDependencies(
                    MeteorDesktop.electronApp.scaffold.getDefaultPackageJson().dependencies
                );
            }).to.throw(/Another version/);
        });

        it('should throw on dependency conflict with core', () => {
            shell.cp('-rf', paths.fixtures.desktop, paths.fixtures.testProjectInstall);
            const moduleJsonPath = path.join(paths.fixtures.testProjectInstall, '.desktop', 'modules', 'someModule', 'module.json');
            const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'UTF-8'));
            moduleJson.dependencies.shelljs = '0.2.0';
            fs.writeFileSync(
                moduleJsonPath, JSON.stringify(moduleJson, null, 2)
            );
            expect(() => {
                const deps = MeteorDesktop.desktop.mergeDependencies(
                    MeteorDesktop.electronApp.scaffold.getDefaultPackageJson().dependencies
                );
            }).to.throw(/Another version/);
        });

    });
});
