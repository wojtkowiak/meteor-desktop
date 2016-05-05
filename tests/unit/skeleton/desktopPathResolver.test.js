/* eslint-disable global-require */
import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import mockery from 'mockery';
import path from 'path';

chai.use(sinonChai);
chai.use(dirty);

const { describe, it, after, before } = global;
const { expect } = chai;

const fs = {};

let DesktopPathResolver;

describe('DesktopPathResolver', () => {
    before(() => {
        mockery.registerMock('fs', fs);
        mockery.enable({
            warnOnReplace: false,
            warnOnUnregistered: false
        });

        DesktopPathResolver = require('../../../skeleton/desktopPathResolver.js').default;
    });

    after(() => {
        mockery.deregisterMock('fs');
        mockery.disable();
    });

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

        it('should use last known good version (if different than initial)', () => {
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

            expect(desktopPath.endsWith('897_desktop.asar')).to.be.true();
        });

        it('should use initial version if last downloaded is using it', () => {
            prepareFsStubs(1, 1, {
                lastSeenInitialVersion: 1,
                lastDownloadedVersion: '546',
                lastKnownGoodVersion: '546',
                blacklistedVersions: []
            });
            const infoStub = sinon.spy();
            const warnStub = sinon.spy();
            readFileSyncStub
                .withArgs(sinon.match('546').and(sinon.match('_desktop.json')))
                .returns(JSON.stringify({ version: 1 }));

            const desktopPath = DesktopPathResolver
                .resolveDesktopPath(__dirname, { info: infoStub, warn: warnStub });

            expect(warnStub.firstCall).to.be.calledWithMatch(sinon.match(
                'will use desktop.asar from initial version because last downloaded version is ' +
                'using it'));

            expect(desktopPath.endsWith(`${path.sep}desktop.asar`)).to.be.true();
        });

        it('should use initial version if last downloaded does not have any', () => {
            prepareFsStubs(1, 1, {
                lastSeenInitialVersion: 1,
                lastDownloadedVersion: '546',
                lastKnownGoodVersion: '546',
                blacklistedVersions: []
            });
            const infoStub = sinon.spy();
            const warnStub = sinon.spy();
            readFileSyncStub
                .withArgs(sinon.match('546').and(sinon.match('_desktop.json')))
                .returns(JSON.stringify({}));

            const desktopPath = DesktopPathResolver
                .resolveDesktopPath(__dirname, { info: infoStub, warn: warnStub });

            expect(warnStub.firstCall).to.be.calledWithMatch(sinon.match(
                'will use desktop.asar from initial version because last downloaded version does ' +
                'not contain new desktop version'));

            expect(desktopPath.endsWith(`${path.sep}desktop.asar`)).to.be.true();
        });

        it('should use initial version if last downloaded is equal to initial version', () => {
            prepareFsStubs(1, 1, {
                lastSeenInitialVersion: 1,
                lastDownloadedVersion: 1,
                lastKnownGoodVersion: 1,
                blacklistedVersions: []
            });
            const infoStub = sinon.spy();
            readFileSyncStub
                .withArgs(sinon.match('546').and(sinon.match('_desktop.json')))
                .returns(JSON.stringify({}));

            const desktopPath = DesktopPathResolver
                .resolveDesktopPath(__dirname, { info: infoStub });

            expect(infoStub.secondCall).to.be.calledWithMatch(sinon.match(
                'will use desktop.asar from last downloaded version which is ' +
                'apparently the initial bundle'));

            expect(desktopPath.endsWith(`${path.sep}desktop.asar`)).to.be.true();
        });

        it('should use last known good version if last downloaded is blacklisted', () => {
            prepareFsStubs(1, 1, {
                lastSeenInitialVersion: 1,
                lastDownloadedVersion: '123',
                lastKnownGoodVersion: '120',
                blacklistedVersions: ['123']
            });

            const infoStub = sinon.spy();
            const warnStub = sinon.spy();

            readFileSyncStub
                .withArgs(sinon.match('120').and(sinon.match('_desktop.json')))
                .returns(JSON.stringify({ version: 897 }));

            const desktopPath = DesktopPathResolver
                .resolveDesktopPath(__dirname, { info: infoStub, warn: warnStub });

            expect(warnStub.firstCall).to.be.calledWithMatch(sinon.match(
                'will use desktop.asar from last known good version'));

            expect(desktopPath.endsWith('897_desktop.asar')).to.be.true();
        });

        it('should use initial version if last know good version is using it', () => {
            prepareFsStubs(1, 1, {
                lastSeenInitialVersion: 1,
                lastDownloadedVersion: '123',
                lastKnownGoodVersion: '120',
                blacklistedVersions: ['123']
            });

            const infoStub = sinon.spy();
            const warnStub = sinon.spy();

            readFileSyncStub
                .withArgs(sinon.match('120').and(sinon.match('_desktop.json')))
                .returns(JSON.stringify({ version: 1 }));

            const desktopPath = DesktopPathResolver
                .resolveDesktopPath(__dirname, { info: infoStub, warn: warnStub });

            expect(warnStub.firstCall).to.be.calledWithMatch(sinon.match(
                'will use desktop.asar from initial version because ' +
                'last known good version of meteor app is using it'));

            expect(desktopPath.endsWith(`${path.sep}desktop.asar`)).to.be.true();
        });

        it('should use initial version if last know good version does not have any', () => {
            prepareFsStubs(1, 1, {
                lastSeenInitialVersion: 1,
                lastDownloadedVersion: '123',
                lastKnownGoodVersion: '120',
                blacklistedVersions: ['123']
            });

            const infoStub = sinon.spy();
            const warnStub = sinon.spy();

            readFileSyncStub
                .withArgs(sinon.match('120').and(sinon.match('_desktop.json')))
                .returns(JSON.stringify({}));

            const desktopPath = DesktopPathResolver
                .resolveDesktopPath(__dirname, { info: infoStub, warn: warnStub });

            expect(warnStub.firstCall).to.be.calledWithMatch(sinon.match(
                'will use desktop.asar from initial version because last ' +
                'known good version of meteor app does not contain new desktop ' +
                'version'));

            expect(desktopPath.endsWith(`${path.sep}desktop.asar`)).to.be.true();
        });

        it('should use initial version if last know good version is using it', () => {
            prepareFsStubs(1, 1, {
                lastSeenInitialVersion: 1,
                lastDownloadedVersion: '123',
                lastKnownGoodVersion: 1,
                blacklistedVersions: ['123']
            });

            const infoStub = sinon.spy();

            readFileSyncStub
                .withArgs(sinon.match('120').and(sinon.match('_desktop.json')))
                .returns(JSON.stringify({ version: 1 }));

            const desktopPath = DesktopPathResolver
                .resolveDesktopPath(__dirname, { info: infoStub });

            expect(infoStub.secondCall).to.be.calledWithMatch(sinon.match(
                'will use desktop.asar from last known good version which is ' +
                'apparently the initial bundle'));

            expect(desktopPath.endsWith(`${path.sep}desktop.asar`)).to.be.true();
        });

        it('should use initial version no last known good version is present', () => {
            prepareFsStubs(1, 1, {
                lastSeenInitialVersion: 1,
                lastDownloadedVersion: '123',
                blacklistedVersions: ['123']
            });

            const infoStub = sinon.spy();
            const warnStub = sinon.spy();

            readFileSyncStub
                .withArgs(sinon.match('120').and(sinon.match('_desktop.json')))
                .returns(JSON.stringify({ version: 1 }));

            const desktopPath = DesktopPathResolver
                .resolveDesktopPath(__dirname, { info: infoStub, warn: warnStub });

            expect(warnStub.firstCall).to.be.calledWithMatch(sinon.match(
                'will use desktop.asar from initial version as a fallback'));

            expect(desktopPath.endsWith(`${path.sep}desktop.asar`)).to.be.true();
        });
    });
});
