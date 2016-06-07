import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
chai.use(sinonChai);
chai.use(dirty);
import sinon from 'sinon';
const { describe, it } = global;
const { expect } = chai;
import DependenciesManager from '../../lib/dependenciesManager';

describe('dependenciesManager', () => {
    /*   let instance;
     beforeEach(() => {
     instance = new DependenciesManager($)
     });*/
    describe('#mergeDependencies', () => {
        it('should merge dependencies', () => {
            const instance = new DependenciesManager({}, { testDep: '1.0.0', testDep2: '2.1.2' });
            const stub1 = sinon.stub(instance, 'validateDependenciesVersions');
            stub1.returns(true);
            const stub2 = sinon.stub(instance, 'detectDuplicatedDependencies');
            stub2.returns(true);
            instance.mergeDependencies('test', { testDep3: '1.2.3', testDep4: '2.4.3' });
            expect(instance.getDependencies()).be.deep.equal(
                {
                    testDep: '1.0.0',
                    testDep2: '2.1.2',
                    testDep3: '1.2.3',
                    testDep4: '2.4.3'
                }
            );

        });
    });
});
