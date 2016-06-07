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

function init() {
    meteorElectronDesktopClient().init();
}

program
    .option('-o, --output   <path>', 'output dir | default = .medc-package')
    // TODO: implement --skip-mobile-build
    .option('-s, --skip-mobile-build', 'if you already have .meteor/local/cordova-build that you want to use, you can skip building it')
    .option('-p, --meteor-port <port>', 'change the default port that meteor needs to reserve while building mobile build');
// TODO: implement --production

program
    .command('init')
    .description('scaffolds .desktop dir in you meteor app')
    .action(init);

program
    .command('run [ddp_url]')
    .description('(default) run')
    .action(run);

program
    .command('*')
    .description('(default) run')
    .action(run);

program.parse(process.argv);

