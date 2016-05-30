import path from 'path';
const { join, resolve } = path;

const testsPath = path.resolve('tests');
const testsTmpPath = join(testsPath, '_tmp_');
const fixturesPath = 'fixtures';
const fixtures = {
    testProject: join(testsPath, fixturesPath, 'meteorProject'),
    testProjectInstall: join(testsTmpPath, 'meteorProject')
};
const cli = resolve(join(__dirname, '..', 'bin', 'cli.js'));
export default { testsPath, testsTmpPath, fixtures, fixturesPath, cli };
