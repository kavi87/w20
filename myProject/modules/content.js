import angular from '{angular}/angular';
import '{angular-resource}/angular-resource';
//import toto from 'not-existing';

let module = angular.module('content', ['ngResource']);
let someConfig;

module.controller('ContentController', [function () {
    this.someConfig = someConfig;
}]);

export function init (w20) {
    someConfig = 'Some config';
}

export function start (w20) {
    someConfig = 'Some config';
}

export { module as angularModules };


