import path from 'path';
const { join, resolve } = path;

const testsPath = path.resolve('tests');
const testsTmpPath = join(testsPath, '_tmp_');
const fixturesPath = 'fixtures';
const projectDir = 'meteorProject';
const fixtures = {
    testProject: join(testsPath, fixturesPath, projectDir),
    testProjectInstall: join(testsTmpPath, projectDir),
    desktop: join(testsPath, fixturesPath, '.desktop'),
    electronApp: join(testsPath, fixturesPath, '.meteor-desktop')
};

const cli = resolve(join(__dirname, '..', 'bin', 'cli.js'));
export default { testsPath, testsTmpPath, fixtures, fixturesPath, cli };
