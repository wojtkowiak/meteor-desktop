import path from 'path';

const { join, resolve } = path;

const testsPath = resolve(path.join(__dirname, '..', '..', 'tests'));
const testsTmpPath = resolve(path.join(testsPath, '.__tmp'));

const fixturesPath = 'fixtures';
const projectDir = 'meteorProject';

const testProjectInstallPath = join(testsTmpPath, projectDir);
const autoUpdateVersionsPath = join(testsTmpPath, 'autoupdate');

const fixtures = {
    testProject: join(testsPath, fixturesPath, projectDir),
    desktop: join(testsPath, fixturesPath, '.desktop'),
    electronApp: join(testsPath, fixturesPath, '.meteor-desktop'),
    bundledWww: join(testsPath, fixturesPath, 'localServer', 'bundledWww'),
    downloadableVersions: join(testsPath, fixturesPath, 'autoUpdate', 'downloadableVersions'),
    autoUpdate: join(testsPath, fixturesPath, 'autoUpdate'),
    partiallyDownloadableVersions: join(
        testsPath, fixturesPath, 'autoUpdate', 'partiallyDownloadedVersions')
};

const cli = resolve(join(__dirname, '..', 'bin', 'cli.js'));
export default {
    testsPath,
    testsTmpPath,
    testProjectInstallPath,
    autoUpdateVersionsPath,
    fixtures,
    fixturesPath,
    cli
};
