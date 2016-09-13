#!/usr/bin/env node
/* eslint-disable global-require */

/* eslint-disable no-console */
const log = console.log;
const error = console.error;
const info = console.info;
/* eslint-enable no-console */

const fs = require('fs');
const path = require('path');
const join = path.join;
const cmd = process.argv[2];
const assignIn = require('lodash/assignIn');
const program = require('commander');

// HELPERS //

/**
 * Looks for .meteor directory.
 * @param {string} appPath - Meteor app path.
 */
function isMeteorApp(appPath) {
    const meteorPath = join(appPath, '.meteor');
    try {
        return fs.statSync(meteorPath).isDirectory();
    } catch (e) {
        return false;
    }
}

/**
 * Just ensures a ddp url is set.
 *
 * @param {string} ddpUrl - The url the meteor app connects to.
 * @returns {string}
 */
function getDdpUrl(ddpUrl) {
    if (!ddpUrl) {
        info('no ddp_url specified, setting default: http://127.0.0.1:3000');
        return 'http://127.0.0.1:3000';
    }
    return ddpUrl;
}

// --------------------------

program
    .option('-o, --output   <path>', 'output dir | default = .medc-package')
    .option('-s, --skip-mobile-build', 'if you already have .meteor/local/cordova-build that you ' +
        'want to use, you can skip building it')
    .option('-b, --build-timeout <timeout_in_sec>', 'change the default timeout when waiting for ' +
        'meteor to build, default 600sec')
    .option('-t, --meteor-port <port>', 'change the default port that meteor needs to reserve ' +
        'while building mobile build')
    .option('-p, --production', 'builds meteor app with the production switch, uglifies contents ' +
        'of .desktop')
    .option('-a, --android', 'force add android as a mobile platform on OSX');

// TODO: implement --production

program
    .usage('[command] [options]')
    .version(require('./../../package.json').version, '-V, --version')
    .on('-h, --help', () => {
        log('  Examples:\n');
        log('    ');
        log(
            [
                '# cd into meteor dir first',
                'cd /your/meteor/app',
                '',
                'meteor-desktop'
            ].join('\n    ')
        );
        log('\n');
    });


function meteorDesktopFactory(ddpUrl) {
    const input = process.cwd();

    if (!isMeteorApp(input)) {
        error(`Not in a meteor app dir\n ${input}`);
        process.exit();
    }

    if (!program.output) {
        program.output = input;
    }

    if (!path.isAbsolute(program.output)) {
        program.output = path.resolve(program.output);
    }

    if (program.output && !fs.existsSync(program.output)) {
        error(`Output folder doesn't exist\n  ${program.output}`);
        process.exit();
    }

    const options = {
        ddpUrl
    };

    assignIn(options, program);

    return require('../..')(
        input,
        program.output,
        options
    );
}

function run(ddpUrl) {
    meteorDesktopFactory(getDdpUrl(ddpUrl)).run();
}

function build(ddpUrl) {
    meteorDesktopFactory(getDdpUrl(ddpUrl)).build();
}

function updateDdpUrl(ddpUrl) {
    meteorDesktopFactory(getDdpUrl(ddpUrl)).updateDdpUrl();
}

function init() {
    meteorDesktopFactory().init();
}

function justRun() {
    meteorDesktopFactory().justRun();
}

function runPackager() {
    meteorDesktopFactory().runPackager();
}


program
    .command('init')
    .description('scaffolds .desktop dir in you meteor app')
    .action(init);

program
    .command('run [ddp_url]')
    .description('(default) builds and run your desktop app')
    .action(run);

program
    .command('build [ddp_url]')
    .description('(default) builds your desktop app')
    .action(build);

program
    .command('update-ddp-url [ddp_url]')
    .description('only updates the ddp url')
    .action(updateDdpUrl);

program
    .command('just-run')
    .description('alias for running `electron .` in `.meteor-desktop`')
    .action(justRun);

program
    .command('package')
    .description('runs electron packager')
    .action(runPackager);


if (process.argv.length === 2 || !~('-h|--help|run|init|build|just-run|package|update-ddp-url'.indexOf(cmd))) {
    let argv = process.argv;
    if (process.argv.length === 2) {
        argv.push('run');
    } else {
        let command = argv.splice(0, 2);
        command = command.concat('run', argv);
        argv = command;
    }
    program.parse(argv);
} else {
    program.parse(process.argv);
}
