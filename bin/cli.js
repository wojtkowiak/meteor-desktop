#!/usr/bin/env node
var program = require('commander');
var log = console.log;
var fs = require('fs');
var path = require('path');
var join = path.join;
var cmd = process.argv[2];

program
    .usage('[command] [options]')
    .version(require('./../package.json').version)
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


function MEDC() {
    var input = process.cwd();

    if (!isMeteorApp(input)) {
        console.error('Not in a meteor app dir\n  ' + input);
        process.exit();
    }

    if (program.output && !fs.existsSync(program.output)) {
        console.error('Output folder doesn\'t exist\n  ' + program.output);
        process.exit();
    }

    return require('..')(
        input,
        program.output,
        program.runFromDist
    );
}


function package() {
    MEDC().app.package();
}

function run() {
    MEDC().app.run();
}
program
    .option('-o, --output   <path>', 'output dir           | default = .medc-build')
    .option('-r, --run-from-dist', 'runs app from the build');

program
    .command('run')
    .description('(default) run')
    .action(run);

program
    .command('package')
    .description('package')
    .action(package);

program.parse(process.argv);

// default command = run
if (process.argv.length === 2 || !~('run|bundle|package'.indexOf(cmd))) {
    run();
}
