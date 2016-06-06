import gulp from 'gulp';
import runSequence from 'run-sequence';
import del from 'del';
import shell from 'shelljs';
import path from 'path';
const { join } = path;
const $ = require('gulp-load-plugins')();
$.merge = require('merge-stream');
import paths from './tests/helpers/paths';


function wrap(stream) {
    stream.on('error', (error) => {
        $.util.log($.util.colors.red(error.message));
        $.util.log(error.stack);
        $.util.log($.util.colors.yellow('[aborting]'));
        stream.end();
    });
    return stream;
}

gulp.task('copyHtml', () => gulp.src('./lib/**/*.html').pipe(gulp.dest('./dist/')));

gulp.task('transpile', ['copyHtml'], () => gulp.src('./lib/**/*.js')
    .pipe($.sourcemaps.init())
    .pipe(wrap($.babel()))
    .pipe($.sourcemaps.write(''))
    .pipe(gulp.dest('./dist/'))
);


gulp.task('test:clean', () => del([paths.testsTmpPath]));

gulp.task('test', ['test:prepare'], () => gulp.src('./tests/integration/**/*.js', { read: false })
    .pipe($.mocha({ reporter: 'spec', compilers: 'js:babel-core/register' }))
    .on('error', $.util.log)
);

gulp.task('test:createEmptyMeteorProject', done => {
    shell.mkdir(paths.testsTmpPath);
    shell.mkdir(paths.fixtures.testProjectInstall);
    shell.cp('-r', paths.fixtures.testProject, paths.testsTmpPath);
    done();
});

gulp.task('test:prepare', ['transpile'], callback => {
    runSequence(
        'test:clean',
        'test:createEmptyMeteorProject',
        callback);
});


gulp.task('watch-test', ['test'], () => gulp.watch(['./lib/**/*.js', './tests/**/*.js'], ['test']));
gulp.task('watch', ['transpile'], () => gulp.watch(['./lib/**/*.js'], ['transpile']));
