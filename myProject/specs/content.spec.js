define([
    '{angular}/angular',
    '{angular-mocks}/angular-mocks',

    '{myProject}/modules/content'
], function (angular) {
    'use strict';

    describe('the DataService', function () {
        var $rootScope,
            dataService;

        beforeEach(function () {

            angular.mock.module('content');

            angular.mock.inject(function (_$rootScope_, $injector) {
                $rootScope = _$rootScope_.$new();
                dataService = $injector.get('DataService');

                $rootScope.$digest();
            });
        });

        it('should get the version', function () {
            dataService.get(
                function (data) {
                    expect(data.version).toEqual('0.1.0');

                }, function (error) {
                    throw new Error('Could not get data, ' + error.status);
                });
        });
    });
});
