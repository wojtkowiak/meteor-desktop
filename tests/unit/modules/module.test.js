/* eslint-disable no-underscore-dangle */
import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import mockery from 'mockery';
import rewire from 'rewire';

import mockerySettings from '../../helpers/mockerySettings';

chai.use(sinonChai);
chai.use(dirty);
const {
    describe, it, before, after
} = global;
const { expect } = chai;

const Electron = {
};

let Module;

describe('Module', () => {
    before(() => {
        mockery.registerMock('electron', Electron);
        mockery.enable(mockerySettings);
        Module = rewire('../../../skeleton/modules/module.js');
    });

    after(() => {
        mockery.deregisterMock('electron');
        mockery.disable();
    });

    describe('#sendInternal', () => {
        it('should throw when no reference to renderer set yet', () => {
            expect(Module.sendInternal.bind(module, 'test')).to.throw(
                /No reference to renderer process/
            );
        });
        it('should send ipc when renderer is set', () => {
            const rendererMock = { send: sinon.stub(), isDestroyed: () => false };
            const revert = Module.__set__('renderer', rendererMock);
            const arg1 = { some: 'data' };
            const arg2 = 'test';
            Module.sendInternal('event', arg1, arg2);
            expect(rendererMock.send).to.be.calledWith('event', arg1, arg2);
            revert();
        });
        it('should not send ipc when renderer is destroyed', () => {
            const rendererMock = { send: sinon.stub(), isDestroyed: () => true };
            const revert = Module.__set__('renderer', rendererMock);
            Module.sendInternal('event');
            expect(rendererMock.send).to.have.callCount(0);
            revert();
        });
    });
    describe('#getEventName', () => {
        it('should return namespaced event name', () => {
            const module = new Module('test');
            expect(module.getEventName('event')).to.equal('test__event');
        });
    });
    describe('#getResponseEventName', () => {
        it('should return namespaced response event name', () => {
            const module = new Module('test');
            expect(module.getResponseEventName('event')).to.equal('test__event___response');
        });
    });

    describe('#setDefaultFetchTimeout', () => {
        it('should call fetch with correct timeout', () => {
            const module = new Module('test');
            const arg1 = { some: 'data' };
            const arg2 = 'test';
            const event = 'yyy';
            module.setDefaultFetchTimeout(999);
            module.fetch = sinon.stub();
            module.call(event, arg1, arg2);
            expect(module.fetch).to.be.calledWith(event, 999, arg1, arg2);
        });
    });
});
