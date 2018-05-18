/* eslint-disable no-underscore-dangle, global-require, no-unused-vars */
import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import mockery from 'mockery';
import importFresh from 'import-fresh';

import mockerySettings from '../../../helpers/mockerySettings';

chai.use(sinonChai);
chai.use(chaiAsPromised);
chai.use(dirty);
const { describe, it, before, after } = global;
const { expect } = chai;

const fs = { };
const fsExtra = { };
const shelljs = { };
let rimrafResult = true;
const rimraf = (path, options, callback) => callback(rimrafResult ? undefined : 'error');

let ioHelper;

describe('ioHelper', () => {
    before(() => {
        mockery.registerMock('fs-plus', fs);
        mockery.registerMock('shelljs', shelljs);
        mockery.registerMock('rimraf', rimraf);
        mockery.registerMock('fs-extra', fsExtra);
        mockery.enable(mockerySettings);
        ioHelper = importFresh('../../../../skeleton/modules/storageMigration/ioHelper.js');
    });

    after(() => {
        mockery.deregisterMock('fs-plus');
        mockery.deregisterMock('shelljs');
        mockery.deregisterMock('rimraf');
        mockery.deregisterMock('fs-extra');
        mockery.disable();
    });

    describe('#findNewestFileOrDirectory', () => {
        it('should return empty array for non existing path', () => {
            fs.existsSync = () => false;
            expect(ioHelper.findNewestFileOrDirectory('/dummy/path').entries).to.deep.equal([]);
            expect(ioHelper.findNewestFileOrDirectory('/dummy/path').newest).to.be.null();
            delete fs.existsSync;
        });
        it('should return the newest file', () => {
            fs.existsSync = () => true;
            shelljs.ls = () => [
                { name: 'file1', mtime: new Date() },
                { name: 'file2', mtime: new Date(Date.now() - 5) }
            ];
            expect(ioHelper.findNewestFileOrDirectory('/dummy/path').newest).to.equal('file1');
            shelljs.ls = () => [
                { name: 'file1', mtime: new Date(Date.now() - 5) },
                { name: 'file2', mtime: new Date(Date.now()) }
            ];
            expect(ioHelper.findNewestFileOrDirectory('/dummy/path').newest).to.equal('file2');
            delete shelljs.ls;
        });
        it('should return the newest file with evaluation of condition function', () => {
            fs.existsSync = () => true;
            shelljs.ls = () => [
                { name: 'file1', mtime: new Date() },
                { name: 'file2', mtime: new Date(Date.now() - 5) }
            ];
            expect(
                ioHelper.findNewestFileOrDirectory('/dummy/path', file => file.name !== 'file1')
                    .newest
            ).to.equal('file2');
            delete shelljs.ls;
        });
    });
    describe('#rimrafPromisfied', () => {
        it('should resolve promise when rimraf succeeds', () => {
            rimrafResult = true;
            return expect(ioHelper.rimrafPromisfied('/dummy/path')).to.be.fulfilled();
        });
        it('should reject promise when rimraf fails', () => {
            rimrafResult = false;
            return expect(ioHelper.rimrafPromisfied('/dummy/path')).to.be.rejectedWith('error');
        });
    });
    describe('#removeFilesIfPresent', () => {
        it('should resolve when no file exists', () => {
            fs.existsSync = () => false;
            return expect(ioHelper.removePaths(['file1'])).to.be.fulfilled();
        });
        it('should resolve when delete function resolves', () => {
            fs.existsSync = () => true;
            return expect(ioHelper.removePaths(['file1'], () => Promise.resolve())).to.be.fulfilled();
        });
        it('should reject when delete function rejects', () => {
            fs.existsSync = () => true;
            return expect(ioHelper.removePaths(['file1'], () => Promise.reject())).to.be.rejected();
        });
    });
    describe('#ioOperationWithRetries', () => {
        it('should resolve when operation resolves in first try', () => {
            fsExtra.copy = () => Promise.resolve();
            return expect(ioHelper.ioOperationWithRetries('copy')).to.be.fulfilled();
        });
        it('should resolve when operation resolves in second try', () => {
            fsExtra.copy = sinon.stub();
            fsExtra.copy.onFirstCall().rejects();
            fsExtra.copy.onSecondCall().resolves();
            return expect(ioHelper.ioOperationWithRetries('copy', 4, 1)).to.be.fulfilled();
        });
        it('should resolve when operation resolves in fifth try', () => {
            fsExtra.copy = sinon.stub();
            for (let i = 0; i <= 3; i += 1) { fsExtra.copy.onCall(i).rejects(); }
            fsExtra.copy.onCall(4).resolves();
            return expect(ioHelper.ioOperationWithRetries('copy', 4, 1)).to.be.fulfilled();
        });
        it('should reject when operation rejects 4 times', () => {
            fsExtra.copy = sinon.stub();
            for (let i = 0; i <= 3; i += 1) { fsExtra.copy.onCall(i).rejects(); }
            fsExtra.copy.onCall(4).resolves();
            return expect(ioHelper.ioOperationWithRetries('copy', 3, 1)).to.be.rejected();
        });
    });
    describe('#batchIoOperationWithRetries', () => {
        it(
            'should resolve when operation resolves',
            () => expect(
                ioHelper.batchIoOperationWithRetries('copy', 3, 1, () => Promise.resolve(), [])
            ).to.be.fulfilled()
        );
        it('should reject when any operation rejects', () => {
            const operation = arg => (arg === 'file1' ? Promise.resolve() : Promise.reject('fail'));
            return expect(ioHelper.batchIoOperationWithRetries('copy', 3, 1, operation, [['file1'], ['file2']])).to.be.rejectedWith('fail');
        });
        it('should pass correct arguments', () => {
            const operation = sinon.spy();
            ioHelper.batchIoOperationWithRetries('copy', 3, 1, operation, [['file1', 'file2']]);
            return expect(operation).to.be.calledWith('copy', 3, 1, 'file1', 'file2');
        });
    });

});


