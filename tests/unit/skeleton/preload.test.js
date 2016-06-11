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

const Electron = {};
mockery.registerMock('electron', Electron);
mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false
});

const rewire = require('rewire');
const Desktop = rewire('../../../skeleton/preload.js');

describe('Desktop', () => {
    function testSend(event, module) {
        const ipcMock = { send: sinon.stub() };
        const revertIpc = Desktop.__set__('ipc', ipcMock);
        const desktop = Desktop.__get__('Desktop');
        const arg1 = { some: 'data' };
        const arg2 = 'test';
        if (module) {
            desktop.sendGlobal(event, arg1, arg2);
            expect(ipcMock.send).to.be.calledWith(event, arg1, arg2);
        } else {
            desktop.send(module, event, arg1, arg2);
            expect(ipcMock.send).to.be.calledWith(`${module}__${event}`, arg1, arg2);
        }
        revertIpc();
    }

    describe('#sendGlobal', () => {
        it('should send ipc', () => {
            testSend('event');
        });
    });
    describe('#send', () => {
        it('should send namespaced ipc', () => {
            testSend('event', 'desktop');
        });
    });

    function prepareOnOrOnceTest(ipcMock, callbacks, once, module, event) {
        const revertIpc = Desktop.__set__('ipc', ipcMock);
        const desktop = Desktop.__get__('Desktop');

        callbacks.forEach(callback => {
            if (once) {
                desktop.once(module, event, callback);
            } else {
                desktop.on(module, event, callback);
            }
        });

        let listeners = 'eventListeners';
        if (once) {
            listeners = 'onceEventListeners';
        }

        expect(desktop[listeners]).to.have.a.property(`${module}__${event}`);
        callbacks.forEach(callback => {
            expect(desktop[listeners][`${module}__${event}`]).to.include(callback);
        });

        return {
            desktop,
            clear: function clear() {
                desktop.eventListeners = {};
                desktop.onceEventListeners = {};
                desktop.registeredInIpc = {};
                revertIpc();
            }
        };
    }

    describe('#once', () => {
        it('should save callback', () => {
            const ipcMock = { on: sinon.stub() };
            const callback = function testCallback() {
            };
            const test = prepareOnOrOnceTest(ipcMock, [callback], true, 'desktop', 'event');
            expect(ipcMock.on).to.be.calledWithMatch('desktop__event', sinon.match.func);
            test.clear();
        });
        it('should save consecutive callbacks', () => {
            const ipcMock = { on: sinon.stub() };

            const callback = function testCallback() {
            };
            const callback2 = function testCallback2() {
            };

            const test = prepareOnOrOnceTest(
                ipcMock, [callback, callback2], true, 'desktop', 'event');
            test.clear();
        });
        it('should call callback (with preserved this) once on events received', () => {
            let ipcCallback;
            // We will create an ipc mock, to get the listener passed to it.
            // We need that listener to fire it to emulate an ipc event arrival.
            const ipcMock = {
                on(event, ipcDirectCallback) {
                    ipcCallback = ipcDirectCallback;
                }
            };
            const onSpy = sinon.spy(ipcMock, 'on');

            const callback = sinon.stub();
            const someObject = { someProp: 'test' };
            let callback2 = function callback2() {
                expect(this.someProp).to.equal('test');
            };
            callback2 = callback2.bind(someObject);
            const test = prepareOnOrOnceTest(
                ipcMock, [callback, callback2], true, 'desktop', 'event');

            const arg1 = { some: 'data' };
            const arg2 = 'test';
            // Now we fake that a event has arrived two times.
            ipcCallback('desktop__event', arg1, arg2);
            ipcCallback('desktop__event', arg1, arg2);

            expect(callback).to.be.calledOnce();
            expect(callback).to.be.calledWith('desktop__event', arg1, arg2);

            expect(test.desktop.onceEventListeners.desktop__event).to.be.empty();

            // Additionally we check if the ipc.on was triggered only once.
            expect(onSpy).to.be.calledOnce();


            test.clear();
        });
    });

    describe('#on', () => {
        it('should save callback', () => {
            const ipcMock = { on: sinon.stub() };
            const callback = function testCallback() {
            };
            const test = prepareOnOrOnceTest(ipcMock, [callback], false, 'desktop', 'event');
            expect(ipcMock.on).to.be.calledWithMatch('desktop__event', sinon.match.func);
            test.clear();
        });
        it('should save consecutive callbacks', () => {
            const ipcMock = { on: sinon.stub() };

            const callback = function testCallback() {
            };
            const callback2 = function testCallback2() {
            };

            const test = prepareOnOrOnceTest(
                ipcMock, [callback, callback2], false, 'desktop', 'event');
            test.clear();
        });
        it('should call callback (with preserved this) on event received', () => {
            let ipcCallback;
            // We will create an ipc mock, to get the listener passed to it.
            // We need that listener to fire it to emulate an ipc event arrival.
            const ipcMock = {
                on(event, ipcDirectCallback) {
                    ipcCallback = ipcDirectCallback;
                }
            };
            const onSpy = sinon.spy(ipcMock, 'on');

            const callback = sinon.stub();
            const someObject = { someProp: 'test' };
            let callback2 = function () {
                expect(this.someProp).to.equal('test');
            };
            callback2 = callback2.bind(someObject);
            const test = prepareOnOrOnceTest(
                ipcMock, [callback, callback2], false, 'desktop', 'event');

            const arg1 = { some: 'data' };
            const arg2 = 'test';
            // Now we fake that a event has arrived.
            ipcCallback('desktop__event', arg1, arg2);
            expect(callback).to.be.calledWith('desktop__event', arg1, arg2);

            // Additionally we check if the ipc.on was triggered only once.
            expect(onSpy).to.be.calledOnce();

            test.clear();
        });
    });

    describe('#removeListener', () => {
        it('should remove a single listener', () => {
            const callback = function callback() {
            };
            const callback2 = function callback2() {
            };
            const callback3 = function callback3() {
            };
            const desktop = Desktop.__get__('Desktop');
            desktop.eventListeners.test__test = [callback, callback2, callback3];
            desktop.onceEventListeners.test__test = [callback, callback2, callback3];
            desktop.removeListener('test', 'test', callback2);
            expect(desktop.eventListeners.test__test).to.include(callback);
            expect(desktop.eventListeners.test__test).to.include(callback3);
            expect(desktop.eventListeners.test__test).not.to.include(callback2);
            expect(desktop.onceEventListeners.test__test).to.include(callback);
            expect(desktop.onceEventListeners.test__test).to.include(callback3);
            expect(desktop.onceEventListeners.test__test).not.to.include(callback2);
        });
    });

    describe('#getEventName', () => {
        it('should return namespaced event name', () => {
            const desktop = Desktop.__get__('Desktop');
            expect(desktop.getEventName('desktop', 'event')).to.equal('desktop__event');
        });
    });
});
