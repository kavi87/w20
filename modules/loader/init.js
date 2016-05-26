/*
 * Copyright (c) 2013-2016, The SeedStack authors <http://seedstack.org>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

(function (window, SystemJS) {
    'use strict';

    if (typeof this !== 'undefined') {
        throw new Error('ECMAScript 5 not supported');
    }

    if (!SystemJS) {
        throw new Error('SystemJS has not been loaded');
    }

    // Cross-browser log function
    {
        let method;
        let methods = [
            'assert', 'clear', 'count', 'debug', 'dir', 'dirxml', 'error',
            'exception', 'group', 'groupCollapsed', 'groupEnd', 'info', 'log',
            'markTimeline', 'profile', 'profileEnd', 'table', 'time', 'timeEnd',
            'timeStamp', 'trace', 'warn'
        ];
        let length = methods.length;
        let console = (window.console = window.console || {});

        while (length--) {
            method = methods[length];

            if (!console[method]) {
                console[method] = function noop () {
                };
            }
        }
    }

    window.define = SystemJS.amdDefine;
    window.require = window.requirejs = SystemJS.amdRequire;

    SystemJS.config({
        baseURL: '.',
        map: {
            'plugin-babel': 'bower_components/system.js-plugin-babel/plugin-babel.js',
            'systemjs-babel-build': 'bower_components/system.js-plugin-babel/systemjs-babel-browser.js',
            '[css]': 'bower_components/system.js-plugin-css/css.js',
            '[text]': 'bower_components/system.js-plugin-text/text.js',
            '[optional]': 'bower_components/w20/modules/optional.js'
        },
        transpiler: 'plugin-babel',
        defaultJSExtensions: true,
        pluginFirst: true
    });

    SystemJS.import('bower_components/w20/modules/loader/w20').catch(function(e) {
        console.error(e && e.stack || e)}
    );

})(window, window.SystemJS || undefined);
