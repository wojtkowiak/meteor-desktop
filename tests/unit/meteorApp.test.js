/* eslint-disable global-require, import/extensions */
import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import mockery from 'mockery';

// need for running test
import asar from 'asar'; // eslint-disable-line no-unused-vars

chai.use(sinonChai);
chai.use(dirty);

const { describe, it, before, after } = global;
const { expect } = chai;

const fs = {};
const METEOR_APP_CONTEXT = { env: { paths: { meteorApp: { release: 'release.file' } } } };
const METEOR_RELEASES = [
    { release: 'METEOR@1.3.4', version: '1.3.4', semver: '1.3.4' },
    { release: 'METEOR@1.4.2.7', version: '1.4.2.7', semver: '1.4.2' },
    { release: 'METEOR@1.5-alpha', version: '1.5', semver: '1.5.0' },
    { release: 'METEOR@2-rc.0', version: '2', semver: '2.0.0' },
    { release: 'METEOR@1.6.0.1\r\n\r\n', version: '1.6.0.1', semver: '1.6.0' }
];

let MeteorApp;

describe('meteorApp', () => {
    before(() => {
        mockery.registerMock('fs', fs);
        mockery.enable({
            warnOnReplace: false,
            warnOnUnregistered: false
        });
        MeteorApp = require('../../lib/meteorApp.js').default;
    });

    after(() => {
        mockery.deregisterMock('fs');
        mockery.disable();
    });

    function prepareFsStubs(release) {
        const readFileSyncStub = sinon.stub();
        readFileSyncStub
            .withArgs(sinon.match('release.file'), 'UTF-8')
            .returns(release);
        fs.readFileSync = readFileSyncStub;
    }

    describe('#castMeteorReleaseToSemver', () => {
        it('should cast release to semver', () => {
            const instance = new MeteorApp(METEOR_APP_CONTEXT);
            METEOR_RELEASES.forEach((version) => {
                prepareFsStubs(version.release);
                expect(instance.castMeteorReleaseToSemver()).be.equal(version.semver);
            });
        });
    });

    describe('#getMeteorRelease', () => {
        it('should parse Meteor version', () => {
            const instance = new MeteorApp(METEOR_APP_CONTEXT);
            METEOR_RELEASES.forEach((version) => {
                prepareFsStubs(version.release);
                expect(instance.getMeteorRelease()).be.equal(version.version);
            });
        });
    });
});
