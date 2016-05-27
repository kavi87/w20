'use strict';

define(['require', '{angular}/angular', '{angular-resource}/angular-resource'], function (require, angular) {
    'use strict';

    var module = angular.module('content', ['ngResource']);

    module.controller('ContentController', ['$scope', '$http', function ($scope, $http) {}]);

    return {
        angularModules: ['content']
    };
});
