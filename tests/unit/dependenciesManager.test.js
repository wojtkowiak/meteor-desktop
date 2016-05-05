import chai from 'chai';
import dirty from 'dirty-chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';

import DependenciesManager from '../../lib/dependenciesManager';

chai.use(sinonChai);
chai.use(dirty);
const { describe, it } = global;
const { expect } = chai;

describe('dependenciesManager', () => {
    describe('#mergeDependencies', () => {
        it('should merge dependencies', () => {
            const instance = new DependenciesManager({}, { testDep: '1.0.0', testDep2: '2.1.2' });
            const stub1 = sinon.stub(instance, 'validateDependenciesVersions');
            stub1.returns(true);
            const stub2 = sinon.stub(instance, 'detectDuplicatedDependencies');
            instance.mergeDependencies('test', { testDep3: '1.2.3', testDep4: '2.4.3' });
            expect(instance.getDependencies()).be.deep.equal(
                {
                    testDep: '1.0.0',
                    testDep2: '2.1.2',
                    testDep3: '1.2.3',
                    testDep4: '2.4.3'
                }
            );
            stub1.restore();
            stub2.restore();
        });
    });
});
