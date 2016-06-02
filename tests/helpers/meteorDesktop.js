import meteorDesktop from '../../dist/index';
import shell from 'shelljs';
import paths from './paths';

export function createTestInstance() {
    shell.rm('-rf', paths.testsTmpPath);

    // Copy test meteor app.
    shell.mkdir(paths.testsTmpPath);
    shell.mkdir(paths.fixtures.testProjectInstall);
    shell.cp('-r', paths.fixtures.testProject, paths.testsTmpPath);

    return meteorDesktop(
        paths.fixtures.testProjectInstall,
        paths.fixtures.testProjectInstall,
        false
    );
}

export default function (input, output, runFromDist) {
    return meteorDesktop(input, output, runFromDist);
}
