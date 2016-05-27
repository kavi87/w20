/* global module: false, grunt: false, process: false */
module.exports = function (grunt) {
    'use strict';

    /*
    * Individual grunt tasks.
    *
    **/
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        bower: {
            install: {
                options: {
                    copy: false
                }
            }
        },

        babel: {
            options: {
                sourceMap: true,
                presets: ['es2015'],
                plugins: ['transform-es2015-modules-amd']
            },
            dist: {
                files: {
                    'dist/**/*.js': 'myProject/**/*.js'
                }
            }
        }

    });


    grunt.loadNpmTasks('grunt-bower-task');
    grunt.loadNpmTasks('grunt-babel');

    grunt.registerTask('default', ['bower', 'babel'], null);
};
