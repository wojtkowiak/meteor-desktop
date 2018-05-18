/* eslint-disable no-underscore-dangle, global-require */
import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';
import mockery from 'mockery';

import mockerySettings from '../../helpers/mockerySettings';

chai.use(sinonChai);
chai.use(dirty);
const { describe, it, before, after } = global;
const { expect } = chai;

const Electron = { protocol: { registerStandardSchemes: Function.prototype } };
const Winston = {};

let App;

const fs = {};

describe('App', () => {
    before(() => {
        mockery.registerMock('electron', Electron);
        mockery.registerMock('winston', Winston);
        mockery.registerMock('./desktopPathResolver', {});
        mockery.registerMock('fs-plus', fs);
        mockery.enable(mockerySettings);
        process.env.METEOR_DESKTOP_UNIT_TEST = true;
        App = require('../../../skeleton/app.js');
        App = App.default;
        const oldProto = App.prototype;
        App = function App() {}; // eslint-disable-line
        App.prototype = oldProto;
    });

    after(() => {
        process.env.METEOR_DESKTOP_UNIT_TEST = false;
        mockery.deregisterMock('./desktopPathResolver');
        mockery.deregisterMock('fs-plus');
        mockery.deregisterMock('electron');
        mockery.deregisterMock('winston');
        mockery.disable();
    });

    describe('#emitAsync', () => {
        it('should resolve when having synchronous handlers', () => {
            const stub1 = sinon.stub();
            const stub2 = sinon.stub();
            const app = new App();
            app.eventsBus = {
                listeners: eventName => ((eventName === 'event') ? [stub1, stub2] : [])
            };
            return new Promise((resolve, reject) => {
                app.emitAsync('event', 'test', 12345)
                    .then(() => {
                        expect(stub1).to.have.been.calledOnce();
                        expect(stub1).to.have.been.calledWith(sinon.match('test'), sinon.match(12345));
                        expect(stub2).to.have.been.calledOnce();
                        expect(stub2).to.have.been.calledWith(sinon.match('test'), sinon.match(12345));
                        resolve();
                    })
                    .catch((err) => {
                        reject(err);
                    });
            });
        });

        it('should resolve with values from promise', () => {
            const app = new App();
            const stub = sinon.stub();
            stub.resolves('test');
            const stub2 = sinon.stub();
            stub2.resolves('test2');
            app.eventsBus = {
                listeners: eventName => ((eventName === 'event') ? [stub, stub2] : [])
            };
            return new Promise((resolve, reject) => {
                app.emitAsync('event', 'test', 12345)
                    .then((result) => {
                        expect(stub).to.have.been.calledOnce();
                        expect(stub).to.have.been.calledWith(sinon.match('test'), sinon.match(12345));
                        expect(result).to.deep.equal(['test', 'test2']);
                        resolve();
                    })
                    .catch((err) => {
                        reject(err);
                    });
            });
        });

        it('should reject with rejection value from failing handler', () => {
            const app = new App();
            const stub = sinon.stub();
            stub.rejects(new Error('reject'));
            const stub2 = sinon.stub();
            stub2.resolves('test2');
            app.eventsBus = {
                listeners: eventName => ((eventName === 'event') ? [stub, stub2] : [])
            };
            return new Promise((resolve, reject) => {
                app.emitAsync('event', 'test', 12345)
                    .then(() => {
                        reject('should not be resolved');
                    })
                    .catch((err) => {
                        expect(err.message).to.equal('reject');
                        resolve();
                    });
            });
        });

        it('should reject with throw value', () => {
            const app = new App();
            const stub = sinon.stub();
            stub.throws(new Error('reject'));
            app.eventsBus = {
                listeners: eventName => ((eventName === 'event') ? [stub] : [])
            };
            app.l = { error: Function.prototype };
            return new Promise((resolve, reject) => {
                app.emitAsync('event', 'test', 12345)
                    .then(() => {
                        reject('should not be resolved');
                    })
                    .catch((err) => {
                        expect(err.message).to.equal('reject');
                        resolve();
                    });
            });
        });
    });
});

