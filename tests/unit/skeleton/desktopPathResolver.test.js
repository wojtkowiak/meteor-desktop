/* eslint-disable no-underscore-dangle */
import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import mockery from 'mockery';
import rewire from 'rewire';
import path from 'path';

chai.use(sinonChai);
chai.use(dirty);

const { describe, it } = global;
const { expect } = chai;

const fs = {};
mockery.registerMock('fs', fs);
mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false
});

const DesktopPathResolver = rewire('../../../skeleton/desktopPathResolver.js').default;

describe('DesktopPathResolver', () => {

    describe('#resolveDesktopPath', () => {

        let readFileSyncStub;

        function prepareFsStubs(desktopVersion, initialMeteorVersion, autoUpdateJson) {
            readFileSyncStub = sinon.stub();
            // initial desktop version
            readFileSyncStub
                .withArgs(sinon.match('desktop.asar').and(sinon.match('settings.json')))
                .returns(JSON.stringify({ desktopVersion }));
            // initial meteor version
            readFileSyncStub
                .withArgs(sinon.match('meteor.asar').and(sinon.match('program.json')))
                .returns(JSON.stringify({ version: initialMeteorVersion }));
            // autoupdate.json
            readFileSyncStub
                .withArgs(sinon.match('autoupdate.json'))
                .returns(JSON.stringify(autoUpdateJson));
            fs.readFileSync = readFileSyncStub;
        }

        it('should use initial version when meteor initial bundle version has changed', () => {
            prepareFsStubs(1, 2, {
                lastSeenInitialVersion: 1
            });
            const warnStub = sinon.spy();
            const desktopPath = DesktopPathResolver
                .resolveDesktopPath(__dirname, {
                    info: () => {},
                    warn: warnStub
                });
            expect(warnStub).to.be.calledWithMatch(sinon.match('will use desktop.asar from' +
                ' initial version because the initial version of meteor app has changed'));
            expect(desktopPath.endsWith(`${path.sep}desktop.asar`)).to.be.true();
        });

        it('should use initial version when no downloaded version is available', () => {
            prepareFsStubs(1, 1, {
                lastSeenInitialVersion: 1,
                lastDownloadedVersion: null
            });
            const infoStub = sinon.spy();
            const desktopPath = DesktopPathResolver
                .resolveDesktopPath(__dirname, { info: infoStub });
            expect(infoStub).to.be.calledWithMatch(
                sinon.match('using desktop.asar from initial bundle'));
            expect(desktopPath.endsWith(`${path.sep}desktop.asar`)).to.be.true();
        });

        it('should use last known good version (different than initial)', () => {
            prepareFsStubs(1, 1, {
                lastSeenInitialVersion: 1,
                lastDownloadedVersion: '546',
                lastKnownGoodVersion: '546',
                blacklistedVersions: []
            });
            const infoStub = sinon.spy();
            readFileSyncStub
                .withArgs(sinon.match('546').and(sinon.match('_desktop.json')))
                .returns(JSON.stringify({ version: 897 }));

            const desktopPath = DesktopPathResolver
                .resolveDesktopPath(__dirname, { info: infoStub });

            expect(infoStub.secondCall).to.be.calledWithMatch(sinon.match('will use desktop.asar' +
                ' from last downloaded version at'));

            expect(desktopPath.endsWith(`897_desktop.asar`)).to.be.true();

        });
    });

});
