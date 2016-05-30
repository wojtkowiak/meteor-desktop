import chai from 'chai';
import dirty from 'dirty-chai';
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;
import paths from '../paths';
import meteorDesktop from '../helpers/meteorDesktop';
import fs from 'fs';
import path from 'path';

describe('app', () => {
    let MeteorDesktop;

    before(() => {
        MeteorDesktop = meteorDesktop(
            paths.fixtures.testProjectInstall,
            paths.fixtures.testProjectInstall,
            false
        );
    });

    describe('#init', () => {
        it('should create .desktop scaffold', done => {
            MeteorDesktop.app.init();
            expect(fs.existsSync(MeteorDesktop.env.meteorApp.desktop)).to.be.true();
            expect(fs.existsSync(MeteorDesktop.env.meteorApp.settings)).to.be.true();
            expect(
                fs.existsSync(
                    path.join(MeteorDesktop.env.meteorApp.desktop, 'splashScreen.png')
                )
            ).to.be.true();
            done();
        });
    });
});
