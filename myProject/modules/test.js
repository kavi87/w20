define([
    'require',
    '{angular}/angular',
    '{angular-resource}/angular-resource'

], function (require, angular) {
    'use strict';

    var module = angular.module('test', ['ngResource']);

    module.controller('TestController', [function () {
        this.someConfig = 'test';
    }]);

    return {
        angularModules: ['test']
    };
});
