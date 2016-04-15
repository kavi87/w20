/* global module: false, config: false */
module.exports = function(config) {
    'use strict';

    config.set({
        frameworks: [ 'jasmine', 'requirejs' ],
        files: [
            'test-main.js',

            { pattern: 'w20.app.json', served: true, included: false },

            { pattern: 'myProject/**/*.js', included: false },
            { pattern: 'bower_components/**/*', included: false }
        ],
        preprocessors: {
            'myProject/modules/*.js': 'coverage'
        },
        reporters: ['dots' ],
        port: 9876,
        colors: true,
        logLevel: 'INFO',
        browsers: [ 'PhantomJS' ]
    });
};