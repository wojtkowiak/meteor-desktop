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

    describe('#validateDependenciesVersions', () => {
        it('should validate git/github', () => {
            const instance = new DependenciesManager({});
            const failRegex = /git or github link must have a commit hash/;
            expect(() => instance.validateDependenciesVersions('test', {
                dep: 'git+ssh://user@hostname:project.git'
            })).to.throw(failRegex);
            expect(() => instance.validateDependenciesVersions('test', {
                dep: 'user/someproject'
            })).to.throw(failRegex);
            expect(() => instance.validateDependenciesVersions('test', {
                dep: 'user/someproject#1234566'
            })).to.not.throw(failRegex);
            expect(() => instance.validateDependenciesVersions('test', {
                dep: 'git+ssh://user@hostname:project.git#1234566'
            })).to.not.throw(failRegex);
        });
        it('should warn on file/local', () => {
            const instance = new DependenciesManager({});
            const warnStub = sinon.stub(instance.log, 'warn');
            const warningMatch = /using dependencies from local paths is permitted/;
            instance.validateDependenciesVersions('test', {
                dep: '../some/path',
                dep2: 'file://path'
            });
            expect(warnStub.firstCall).to.be.calledWithMatch(warningMatch);
            expect(warnStub).to.be.calledOnce();
        });
        it('should validate semver', () => {
            const instance = new DependenciesManager({});
            const failRegex = /semver ranges are forbidden, please specify exact version/;
            const testVersions = [
                '1.0.0 - 2.9999.9999',
                '>=1.0.2 <2.1.2',
                '>1.0.2 <=2.3.4',
                '<1.0.0 || >=2.3.1 <2.4.5 || >=2.5.2 <3.0.0',
                '~1.2',
                '~1.2.3',
                '2.x',
                '3.3.x',
                '',
                '*'
            ];
            testVersions.forEach((version) => {
                expect(() => instance.validateDependenciesVersions('test', {
                    dep: version
                })).to.throw(failRegex);
            });
            expect(() => instance.validateDependenciesVersions('test', {
                dep: '2.3.1'
            })).to.not.throw(failRegex);
        });
    });

     const testDependencies = {
         module1: '../foo/bar',
         module2: '~/foo/bar',
         module3: './foo/bar',
         module4: '/foo/bar',
         module5: 'foo/bar',
         module6: 'git://github.com',
         module7: 'http://asdf.com/asdf.tar.gz',
         module8: 'file:../dyl',
         module9: '2.0.1'
     };

    describe('#getLocalDependencies', () => {
        it('should return only local dependencies', () => {
            const instance = new DependenciesManager({});

            instance.dependencies = Object.assign({}, testDependencies);
            const localDeps = instance.getLocalDependencies();

            const depsKeys = Object
                .keys(localDeps)
                .map(dep => parseInt(dep.substr(dep.length - 1), 10));
            expect(depsKeys).to.be.eql([1, 2, 3, 4, 8]);
        });
    });

    describe('#getRemoteDependencies', () => {
        it('should return only remote dependencies', () => {
            const instance = new DependenciesManager({});

            instance.dependencies = Object.assign({}, testDependencies);
            const localDeps = instance.getRemoteDependencies();

            const depsKeys = Object
                .keys(localDeps)
                .map(dep => parseInt(dep.substr(dep.length - 1), 10));
            expect(depsKeys).to.be.eql([5, 6, 7, 9]);
        });
    });

    describe('#detectDependencyType', () => {
        it('should detect local path', () => {
            const instance = new DependenciesManager({});

            let files = [
                '../foo/bar',
                '~/foo/bar',
                './foo/bar',
                '/foo/bar',
                'foo/bar',
                'git://github.com',
                'http://asdf.com/asdf.tar.gz',
                'file:../dyl',
                '2.0.1'
            ];
            files = files.map(filePath => instance.detectDependencyVersionType(filePath));

            expect(files.slice(0, 4)).to.be.eql(new Array(4).fill('local'));
            expect(files.slice(4)).to.not.include('local');
        });

        it('should detect git links', () => {
            const instance = new DependenciesManager({});

            let files = [
                'git://github.com/user/project.git#commit-ish',
                'git+ssh://user@hostname:project.git#commit-ish',
                'git+ssh://user@hostname/project.git#commit-ish',
                'git+http://user@hostname/project/blah.git#commit-ish',
                'git+https://user@hostname/project/blah.git#commit-ish',
                '../foo/bar',
                '/foo/bar',
                'foo/bar',
                'http://asdf.com/asdf.tar.gz',
                'file:../dyl',
                '2.0.1'
            ];
            files = files.map(filePath => instance.detectDependencyVersionType(filePath));

            expect(files.slice(0, 5)).to.be.eql(new Array(5).fill('git'));
            expect(files.slice(5)).to.not.include('git');
        });

        it('should detect github link', () => {
            const instance = new DependenciesManager({});

            let files = [
                'visionmedia/express',
                'visionmedia/mocha#4727d357ea',
                'git://github.com/user/project.git#commit-ish',
                '../foo/bar',
                '/foo/bar',
                'http://asdf.com/asdf.tar.gz',
                'file:../dyl',
                '2.0.1'
            ];
            files = files.map(filePath => instance.detectDependencyVersionType(filePath));

            expect(files.slice(0, 2)).to.be.eql(new Array(2).fill('github'));
            expect(files.slice(2)).to.not.include('github');
        });

        it('should detect github link', () => {
            const instance = new DependenciesManager({});

            let files = [
                'http://asdf.com/asdf.tar.gz',
                'https://asdf.com/asdf.tar.gz',
                'visionmedia/express',
                'git://github.com/user/project.git#commit-ish',
                '../foo/bar',
                '/foo/bar',
                'file:../dyl',
                '2.0.1'
            ];
            files = files.map(filePath => instance.detectDependencyVersionType(filePath));

            expect(files.slice(0, 2)).to.be.eql(new Array(2).fill('http'));
            expect(files.slice(2)).to.not.include('http');
        });

        it('should detect file protocol', () => {
            const instance = new DependenciesManager({});

            let files = [
                'file:../dyl',
                'http://asdf.com/asdf.tar.gz',
                'visionmedia/express',
                'git://github.com/user/project.git#commit-ish',
                '../foo/bar',
                '/foo/bar',
                '2.0.1'
            ];
            files = files.map(filePath => instance.detectDependencyVersionType(filePath));

            expect(files.slice(0, 1)).to.be.eql(new Array(1).fill('file'));
            expect(files.slice(1)).to.not.include('file');
        });

        it('should detect version or tag', () => {
            const instance = new DependenciesManager({});
            let files = [
                '1.0.0 - 2.9999.9999',
                '>=1.0.2 <2.1.2',
                '>1.0.2 <=2.3.4',
                '2.0.1',
                '<1.0.0 || >=2.3.1 <2.4.5 || >=2.5.2 <3.0.0',
                '~1.2',
                '~1.2.3',
                '2.x',
                '3.3.x',
                'latest',
                'next',
                'file:../dyl',
                'http://asdf.com/asdf.tar.gz',
                'visionmedia/express',
                'git://github.com/user/project.git#commit-ish',
                '../foo/bar',
                '/foo/bar',
            ];
            files = files.map(filePath => instance.detectDependencyVersionType(filePath));
            expect(files.slice(0, 11)).to.be.eql(new Array(11).fill('version'));
            expect(files.slice(11)).to.not.include('version');
        });
    });
});
