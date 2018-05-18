/* eslint-disable global-require */
import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import path from 'path';
import fs from 'fs';
import shell from 'shelljs';
import mockery from 'mockery';
import crypto from 'crypto';

import mockerySettings from '../../helpers/mockerySettings';
import paths from '../../helpers/paths';
import { getFakeLogger } from '../../helpers/meteorDesktop';


chai.use(sinonChai);
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;

const Electron = { app: { getPath: () => paths.storagesPath } };

function getFileHash(file) {
    const hash = crypto.createHash('sha1');
    hash.update(fs.readFileSync(file));
    return hash.digest('hex');
}

function getLocalStoragePath(port) {
    return path.join(paths.storagesPath, 'Local Storage', `http_127.0.0.1_${port}.localstorage`);
}

let localStorageSourceHash;
let localStorageSource;

let StorageManager;
describe('storageMigration', () => {
    before(() => {
        mockery.registerMock('electron', Electron);
        mockery.enable(mockerySettings);
        StorageManager = require('../../../skeleton/modules/storageMigration');
        StorageManager = StorageManager.default;
    });

    after(() => {
        mockery.deregisterMock('electron');
        mockery.disable();
    });

    beforeEach(() => {
        shell.mkdir(paths.testsTmpPath);
        shell.cp('-rf', paths.fixtures.storages, paths.storagesPath);

        // Make the files for port 57214 the newest.
        fs.utimesSync(path.join(paths.storagesPath, 'Local Storage', 'http_127.0.0.1_57214.localstorage'), (Date.now() / 1000) + 100, (Date.now() / 1000) + 100);
        fs.utimesSync(path.join(paths.storagesPath, 'Local Storage', 'http_127.0.0.1_57214.localstorage-journal'), (Date.now() / 1000) + 100, (Date.now() / 1000) + 100);

        localStorageSource = getLocalStoragePath(57214);
        localStorageSourceHash = getFileHash(localStorageSource);
    });

    afterEach(() => {
        shell.rm('-rf', paths.storagesPath);
    });

    describe('#storageManager', () => {
        it('test', (done) => {
            const storageManager = new StorageManager({
                log: getFakeLogger(true, true),
                appSettings: {},
                // fake systemEvents
                eventsBus: {
                    on() {
                    }
                }
            });

            storageManager.manage()
                .then(() => {
                    expect(localStorageSourceHash).to.equal(getFileHash(path.join(paths.storagesPath, 'Local Storage', 'meteor_desktop_0.localstorage')));
                    done();
                })
                .catch((e) => {
                    done(e);
                });
        });
    });
});
