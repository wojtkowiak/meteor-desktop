/* eslint-disable no-underscore-dangle */

import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
chai.use(sinonChai);
chai.use(dirty);
import sinon from 'sinon';
const { describe, it } = global;
const { expect } = chai;

import mockery from 'mockery';

const Electron = {
};
mockery.registerMock('electron', Electron);
mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false
});

const rewire = require('rewire');
const Module = rewire('../../../skeleton/modules/module.js');

describe('Module', () => {
    describe('#sendInternal', () => {
        it('should throw when no reference to renderer set yet', () => {
            const module = new Module('test');
            expect(module.sendInternal.bind(module, 'test')).to.throw(
                /No reference to renderer process/
            );
        });
        it('should send ipc when renderer is set', () => {
            const module = new Module('test');
            const rendererMock = { send: sinon.stub() };
            const revert = Module.__set__('renderer', rendererMock);
            const arg1 = { some: 'data' };
            const arg2 = 'test';
            module.sendInternal('event', arg1, arg2);
            expect(rendererMock.send).to.be.calledWith('event', arg1, arg2);
            revert();
        });
    });
    describe('#getEventName', () => {
        it('should return namespaced event name', () => {
            const module = new Module('test');
            expect(module.getEventName('event')).to.equal('test__event');
        });
    });
});

