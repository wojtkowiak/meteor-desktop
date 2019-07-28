require('shelljs/global');
var path = require('path');
var readline = require('readline');
var fs = require('fs');
var crossSpawn = require('cross-spawn');

var rl;

console.log('\n');
console.log('┌┬┐┌─┐┌┬┐┌─┐┌─┐┬─┐  ┌┬┐┌─┐┌─┐┬┌─┌┬┐┌─┐┌─┐');
console.log('│││├┤  │ ├┤ │ │├┬┘───││├┤ └─┐├┴┐ │ │ │├─┘');
console.log('┴ ┴└─┘ ┴ └─┘└─┘┴└─  ─┴┘└─┘└─┘┴ ┴ ┴ └─┘┴  ');
console.log('     development environment setup script');
console.log('\n');

console.log('This script will git clone other meteor-desktop related repos and create a test' +
    ' application.\n\n');

var projectsDir = path.resolve('./..');
var resolvedPath;
var npm = path.resolve('./node_modules/.bin/npm');

console.log('Assuming your projects directory is: ' + projectsDir + '\n\n');

function question(question) {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(function(resolve, reject) {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

function spawn(cmd, args, cwd) {
    return new Promise(function(resolve, reject) {
        crossSpawn(cmd, args, {
            cwd,
            stdio: 'inherit'
        }).on('exit', function (code) {
            if (code === 0) {
                resolve();
            } else {
                reject(code);
            }
        });
    });
}

function finish() {
    console.log('\nSeems that everything went alright.\n');
    console.log('A meteor-desktop-test-app was prepared. It has a `desktop` npm script defined' +
        ' that runs meteor-desktop directly from it\'s directory. Remember to' +
        ' run `build-watch` during development. The test app also uses' +
        ' `meteor-desktop-test-suite` through npm link and the desktop app has `linkPackages`' +
        ' options set in `settings.json` so it will also use linked plugins.');
}

var cloneMeteorDesktop = false;
var forks = false;
var username = '';
var projects = [ 'meteor-desktop-test-suite', 'meteor-desktop-splash-screen', 'meteor-desktop-localstorage' ];

question('Do you want to use another path (yes/no)? ')
    .then(function(answer) {
        answer = answer.toLowerCase();
        if (answer === 'y' || answer === 'yes') {
            return question('Enter absolute or relative path: ');
        }
        return projectsDir;
    })
    .then(function(projectsPath) {
        resolvedPath = path.resolve(projectsPath);
        if (!fs.existsSync(resolvedPath)) {
            console.error('The path: ' + resolvedPath + ' does not exist.');
            process.exit(0);
        }
        cd(resolvedPath);
        console.log('\n\nWill prepare dev env in: ' + resolvedPath + '\n');
        return !fs.existsSync(path.join(resolvedPath, 'meteor-desktop'));
    })
    .then(function(clone) {
        cloneMeteorDesktop = clone;
        return question('If you want to clone your fork(s) type your github account name or' +
            ' leave empty otherwise: ');
    })
    .then(function(githubUsername) {
        if (githubUsername.trim() !== '') {
            forks = true;
            username = githubUsername.trim();
        }

        console.log('\n\n\nCloning...\n\n');

        if (cloneMeteorDesktop) {
            projects.unshift('meteor-desktop');
        }

        if (!forks) {
            projects.forEach(function (project) {
                exec('git clone https://github.com/wojtkowiak/' + project);
            });
        } else {
            var code;
            projects.forEach(function (project) {
                code = exec('git clone https://github.com/' + username + '/' + project).code;
                if (code !== 0) {
                    exec('git clone https://github.com/wojtkowiak/' + project);
                } else {
                    console.log(project + ' fork not found, cloning main repo instead.');
                    exec('git remote add upstream https://github.com/wojtkowiak/' + project, { cwd: path.join(resolvedPath, project) });
                }
            });
        }
        console.log('\nCreating meteor-desktop-test-app');
        exec('meteor create meteor-desktop-test-app --release=METEOR@1.6');

        console.log('Installing deps in meteor-desktop...\n');
        return spawn(npm, ['install'], path.join(resolvedPath, 'meteor-desktop'));
    })
    .then(function() {
        console.log('Installing deps in meteor-desktop-test-suite...\n');
        cd(path.join(resolvedPath, 'meteor-desktop-test-suite'));
        console.log('Linking...');
        exec(npm + ' link');
        cd(resolvedPath);
        return spawn(npm, ['install'], path.join(resolvedPath, 'meteor-desktop-test-suite'));
    })
    .then(function() {
        console.log('Installing deps in meteor-desktop-splash-screen...\n');
        cd(path.join(resolvedPath, 'meteor-desktop-splash-screen'));
        console.log('Linking...');
        exec(npm + ' link');
        exec(npm + ' link meteor-desktop-test-suite');
        cd(resolvedPath);
        return spawn(npm, ['install'], path.join(resolvedPath, 'meteor-desktop-splash-screen'));
    })
    .then(function() {
        console.log('Installing deps in meteor-desktop-localstorage...\n');
        cd(path.join(resolvedPath, 'meteor-desktop-localstorage'));
        console.log('Linking...');
        exec(npm + ' link meteor-desktop-test-suite');
        exec(npm + ' link');
        cd(resolvedPath);
        return spawn(npm, ['install'], path.join(resolvedPath, 'meteor-desktop-localstorage'));
    })
    .then(function() {
        console.log('Adding meteor-desktop to test project...\n\n');
        return spawn(npm, ['install', '--save-dev', '../meteor-desktop'], path.join(resolvedPath, 'meteor-desktop-test-app'));
    })
    .then(function() {
        cd(path.join(resolvedPath, 'meteor-desktop-test-app'));
        console.log('Linking...');
        exec(npm + ' link meteor-desktop-test-suite');
        console.log('Installing cross-env, babel-runtime');
        exec(npm + ' install --save-dev cross-env');
        exec(npm + ' install --save babel-runtime');
        cd(resolvedPath);
        var packageJsonPath = path.join(resolvedPath, 'meteor-desktop-test-app', 'package.json');
        var packageJson = JSON.parse(fs.readFileSync(packageJsonPath), 'utf8');
        packageJson.scripts.desktop = 'cross-env METEOR_PACKAGE_DIRS=' + path.join(resolvedPath, 'meteor-desktop', 'plugins') + ' node ../meteor-desktop/dist/bin/cli.js';
        packageJson.scripts.start = 'cross-env METEOR_PACKAGE_DIRS=' + path.join(resolvedPath, 'meteor-desktop', 'plugins') + ' meteor run' ;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        console.log('Running npm run desktop -- init');
        exec(npm + ' run desktop -- init', { cwd: path.join(resolvedPath, 'meteor-desktop-test-app') });

        var settingsJsonPath = path.join(resolvedPath, 'meteor-desktop-test-app', '.desktop', 'settings.json');
        var settingsJson = JSON.parse(fs.readFileSync(settingsJsonPath), 'utf8');
        settingsJson.linkPackages = ['meteor-desktop-splash-screen', 'meteor-desktop-localstorage'];
        fs.writeFileSync(settingsJsonPath, JSON.stringify(settingsJson, null, 2));

        return spawn(npm, ['run', 'desktop', '--', 'init-tests-support'], path.join(resolvedPath, 'meteor-desktop-test-app'));
    })
    .then(function() {
        console.log('\n\n\n');
        return question('Do you want to run tests (yes/no)? ');
    })
    .then(function(answer) {
        answer = answer.toLowerCase();
        if (answer === 'n' || answer === 'no') {
            finish();
        }
        return spawn(npm, ['run', 'test'], path.join(resolvedPath, 'meteor-desktop'));
    })
    .then(function() {
        return spawn(npm, ['run', 'test'], path.join(resolvedPath, 'meteor-desktop-splash-screen'));
    })
    .then(function() {
        return spawn(npm, ['run', 'test'], path.join(resolvedPath, 'meteor-desktop-localstorage'));
    })
    .then(function() {
        return spawn(npm, ['run', 'desktop', '--', 'build', '-b'], path.join(resolvedPath, 'meteor-desktop-test-app'));
    })
    .then(function() {
        return spawn(npm, ['run', 'test-desktop'], path.join(resolvedPath, 'meteor-desktop-test-app'));
    })
    .then(function() {
      finish();
    })
    .catch(function(e) { console.log(e); e.trace(); });
