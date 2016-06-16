import path from 'path';
const { join, resolve } = path;

const testsPath = path.resolve('tests');
const testsTmpPath = path.resolve(path.join(testsPath, '_tmp_'));

const fixturesPath = 'fixtures';
const projectDir = 'meteorProject';
const fixtures = {
    testProject: join(testsPath, fixturesPath, projectDir),
    testProjectInstall: join(testsTmpPath, projectDir),
    autoUpdateVersionsInstall: join(testsTmpPath, 'autoupdate'),
    desktop: join(testsPath, fixturesPath, '.desktop'),
    electronApp: join(testsPath, fixturesPath, '.meteor-desktop'),
    bundledWww: join(testsPath, fixturesPath, 'localServer', 'bundledWww'),
    downloadableVersions: join(testsPath, fixturesPath, 'autoUpdate', 'downloadableVersions'),
    autoUpdate: join(testsPath, fixturesPath, 'autoUpdate'),
    partiallyDownloadableVersions: join(testsPath, fixturesPath, 'autoUpdate', 'partiallyDownloadedVersions')
};

const cli = resolve(join(__dirname, '..', 'bin', 'cli.js'));
export default { testsPath, testsTmpPath, fixtures, fixturesPath, cli };
