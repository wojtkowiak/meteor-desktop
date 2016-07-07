#!/usr/bin/env node
const program = require('commander');
const log = console.log;
const fs = require('fs');
const path = require('path');
const join = path.join;
const cmd = process.argv[2];
const assignIn = require('lodash/assignIn');

program
    .usage('[command] [options]')
    .version(require('./../../package.json').version)
    .on('--help', () => {
        log('  Examples:\n');
        log('    ' + [
            '# cd into meteor dir first',
            'cd /your/meteor/app',
            '',
            'meteor-desktop'
        ].join('\n    ') + '\n');
    });

/**
 * Looks for .meteor directory.
 * @param {string} appPath - Meteor app path.
 */
function isMeteorApp(appPath) {
    return fs.existsSync(join(appPath, '.meteor'));
}

function getMeteorSettingsPath() {
    if (!program.settings) return null;
    var relative = join(process.cwd(), program.settings);
    var absolute = path.resolve(program.settings);
    var settings = (absolute === program.settings ? absolute : relative);

    if (!fs.existsSync(settings)) {
        log('Settings file not found: ', relative);
        process.exit();
    }
    return settings;
}


function meteorElectronDesktopClient(ddpUrl) {
    const input = process.cwd();

    if (!isMeteorApp(input)) {
        console.error('Not in a meteor app dir\n  ' + input);
        process.exit();
    }

    if (!program.output) {
        program.output = input;
    }

    if (!path.isAbsolute(program.output)) {
        program.output = path.resolve(program.output);
    }

    if (program.output && !fs.existsSync(program.output)) {
        console.error('Output folder doesn\'t exist\n  ' + program.output);
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


function packageApp() {
    meteorElectronDesktopClient().app.package();
}

function run(ddpUrl) {
    if (!ddpUrl) {
        ddpUrl = 'http://127.0.0.1:3000';
        console.info('no ddp_url specified, setting default: ' + ddpUrl);
    }
    meteorElectronDesktopClient(ddpUrl).run();
}

function build(ddpUrl) {
    if (!ddpUrl) {
        ddpUrl = 'http://127.0.0.1:3000';
        console.info('no ddp_url specified, setting default: ' + ddpUrl);
    }
    meteorElectronDesktopClient(ddpUrl).build();
}


function init() {
    meteorElectronDesktopClient().init();
}

function justRun() {
    meteorElectronDesktopClient().justRun();
}

function runPackager() {
    meteorElectronDesktopClient().runPackager();
}

program
    .option('-o, --output   <path>', 'output dir | default = .medc-package')
    // TODO: implement --skip-mobile-build
    .option('-s, --skip-mobile-build', 'if you already have .meteor/local/cordova-build that you want to use, you can skip building it')
    .option('-b, --build-timeout <timeout_in_sec>', 'change the default timeout when waiting for meteor to build, default 600sec')
    .option('-t, --meteor-port <port>', 'change the default port that meteor needs to reserve while building mobile build')
    .option('-p, --production', 'builds meteor app with the production switch, uglifies contents of .desktop')
    .option('-a, --android', 'force add android as a mobile platform on OSX');

// TODO: implement --production


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
    .command('just-run')
    .description('alias for running `electron .` in `.meteor-desktop`')
    .action(justRun);

program
    .command('package')
    .description('runs electron packager')
    .action(runPackager);


if (process.argv.length === 2 || !~('-h|--help|run|init|build|just-run|package'.indexOf(cmd))) {
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
