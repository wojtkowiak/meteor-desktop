import chai from 'chai';
import dirty from 'dirty-chai';
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;
import { createTestInstance, stubLog } from '../helpers/meteorDesktop';
import fs from 'fs';

describe('electronAppScaffold', () => {
    let MeteorDesktop;

    beforeEach(() => {
        MeteorDesktop = createTestInstance();
    });

    describe('#make', () => {
        it('should create .meteor-desktop scaffold', () => {
            const logStub = stubLog(MeteorDesktop.electronApp.scaffold, 'info');
            MeteorDesktop.electronApp.scaffold.make();

            expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.root)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.cordova)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.index)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.app)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.preload)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.modules)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.packageJson)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.paths.electronApp.gitIgnore)).to.be.true();

            logStub.restore();
        });
    });
});
