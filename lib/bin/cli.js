#!/usr/bin/env node
var program = require('commander');
var log = console.log;
var fs = require('fs');
var path = require('path');
var join = path.join;
var cmd = process.argv[2];

program
    .usage('[command] [options]')
    .version(require('./../../package.json').version)
    .on('--help', function onHelp() {
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
    var input = process.cwd();

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
        ddpUrl,
        runFromDist: program.runFromDist,
        port: program.meteorPort
    };

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
    .command('run <ddp_url>')
    .description('(default) run')
    .action(run);

/*program
    .command('package')
    .description('package')
    .action(packageApp);*/

program.parse(process.argv);

// default command = run
if (process.argv.length === 2 || !~('run|bundle|packageApp|init'.indexOf(cmd))) {
    run(process.argv.length > 1 ? process.argv[2] : undefined);
}
