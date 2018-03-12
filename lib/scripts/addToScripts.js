/* eslint-disable no-console */
import path from 'path';

import addScript from './utils/addScript';
/**
 * This script adds a 'desktop' entry to 'scripts' in package.json. If the entry already exists
 * it leaves it untouched.
 */
function fail() {
    console.error('[meteor-desktop] failed to add meteor-desktop to your package.json scripts, ' +
        'please add it manually as \'desktop\': \'meteor-desktop\'');
    process.exit(0);
}

const packageJsonPath = path.resolve(
    path.join(__dirname, '..', '..', '..', '..', 'package.json')
);

addScript('desktop', 'meteor-desktop', packageJsonPath, fail);

console.log('[meteor-desktop] successfully added a \'desktop\' entry to your package.json' +
    ' scripts section.');
