/*
 * Copyright (c) 2013-2016, The SeedStack authors <http://seedstack.org>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global require: false */

import Utils from './utils';

    var W20_DEBUG_MODE = 'W20_DEBUG_MODE!';


    /////////////////////////////////////////////////////////////////////
    // UTILITY FUNCTIONS                                               //
    /////////////////////////////////////////////////////////////////////




    // This function enables visual error reporting in the loading screen
    var report = (function () {
        var errorLevel = null;

        return function (type, message, detail, isFatal, info) {
            // Special case of reporting just an Error
            if (type instanceof Error) {
                report('error', type.message, function () {
                    if (typeof type.detail !== 'undefined') {
                        return type.detail;
                    } else if (typeof type.stack === 'undefined') {
                        return 'No detail.';
                    } else {
                        return type.stack.replace(/^(?!at).*$/m, '').trim();
                    }
                }, true, type.info); // Error objects are always fatal
                return;
            }

            var constrainedType = {info: 'info', warn: 'warn', error: 'error'}[type] || 'error',
                detailContent,
                cloakElement = window.document.getElementById('w20-loading-cloak'),
                computeLevel = function (newLevel) {
                    if (newLevel === 'info') {
                        return;
                    }
                    if (newLevel === 'warn' && errorLevel === 'error') {
                        return;
                    }

                    return newLevel;
                };

            if (typeof detail !== 'undefined') {
                if (typeof detail === 'function') {
                    detailContent = detail().toString();
                } else {
                    detailContent = detail.toString();
                }
            }

            console[constrainedType](message + (typeof detailContent !== 'undefined' ? '\n' + detailContent : ''));

            if (cloakElement !== null) {
                if (errorLevel === null) {
                    cloakElement.innerHTML = '<div id="w20-error-content" class="failure failure-' + constrainedType + '"><span class="title">Error report</span><div id="w20-error-detail" class="detail"><ul id="w20-error-detail-list"></ul></span></div><button class="retry" onclick="window.document.location.reload()">Retry</button></div></div>';
                    errorLevel = constrainedType;
                } else {
                    errorLevel = computeLevel(constrainedType);
                    window.document.getElementById('w20-error-content').setAttribute('class', 'failure failure-' + errorLevel);
                }

                var detailListElement = window.document.getElementById('w20-error-detail-list'),
                    detailElement = window.document.getElementById('w20-error-detail');
                detailListElement.innerHTML = detailListElement.innerHTML + '<li>[' + constrainedType.substring(0, 1).toUpperCase() + '] ' + message + (typeof detailContent !== 'undefined' ? ' <blockquote>' + detailContent.replace(/\n/g, '<br/>').replace(/\t/g, '&emsp;&emsp;') + '</blockquote>' : '') + '</li>';
                detailElement.scrollTop = detailElement.scrollHeight;
            }

            if (isFatal) {
                if (typeof info !== 'undefined') {
                    var errorpage = info.path;
                    if (typeof errorpage === 'undefined') {
                        errorpage = 'errors/' + (info.type || 'unknown') + (info.type === 'http' ? '-' + (info.status || 'unknown') : '') + '.html';
                    }

                    Utils.getContents(errorpage, w20Object.corsWithCredentials, function (errorContent) {
                        var errorDocument = window.document.open('text/html', 'replace');
                        try {
                            errorDocument.write(Utils.replacePlaceholders(errorContent, info));
                        } catch (e) {
                            errorDocument.write(errorContent);
                        }
                        errorDocument.close();
                    }, function () {
                        // Do nothing here (error has already been shown)
                    });
                }
                report('error', 'A fatal error occurred, aborting startup');
                report('info', 'If this is the first time you see this error, clear your browser cache before retrying');
                requireErrorHandler.disable(); // to avoid requirejs error handler re-catching this error
                throw new Error('abort');
            }
        };
    })();

    // This formats a limited subset of a json schema in a user-friendly way
    var formatJsonSchema = (function () {
        function shift(value, level) {
            var tabs = '';
            for (var i = 0; i < level; i++) {
                tabs += '\t';
            }
            return tabs + value;
        }

        function buildConfigurationDescription(node, level) {
            var output = '';

            if (node.properties) {
                var properties = node.properties;
                for (var property in properties) {
                    if (properties.hasOwnProperty(property)) {
                        output += shift(property + ' (' + properties[property].type + '): ' + properties[property].description + '\n', level);
                        output += buildConfigurationDescription(properties[property], level + 1);
                    }
                }
            } else if (node.items) {
                var items = node.items;
                output += shift('Item type: ' + items.type + '\n', level);
                output += buildConfigurationDescription(items, level + 1);
            }

            return output;
        }

        return function (jsonSchema) {
            return jsonSchema.title + ':\n' + buildConfigurationDescription(jsonSchema, 1);
        };
    })();

    /////////////////////////////////////////////////////////////////////
    // GLOBAL CONFIGURATION                                            //
    /////////////////////////////////////////////////////////////////////

    var useBundles = false,
        allModules = {},
        w20Object = {
            console: console,
            requireConfig: {
                baseUrl: '.',
                config: {
                    '{requirejs-text}/text': {
                        onXhr: function (xhr) {
                            var xsrfToken = Utils.getCookie('XSRF-TOKEN');

                            if ('withCredentials' in xhr) {
                                xhr.withCredentials = w20Object.corsWithCredentials;
                            }

                            if (xsrfToken) {
                                xhr.setRequestHeader("X-XSRF-TOKEN", xsrfToken);
                            }
                        },

                        useXhr: function () {
                            return true;
                        }
                    }
                },
                paths: {},
                map: {},
                bundles: {},
                waitSeconds: 30
            },
            ready: false,
            corsWithCredentials: false,
            reloadInDebug: function () {
                window.name = W20_DEBUG_MODE + window.name;
                window.location.reload();
            }
        };

    w20Object.debug = w20Object.debug || (function () {
            if (new RegExp('^' + W20_DEBUG_MODE).test(window.name)) {
                window.name = window.name.replace(W20_DEBUG_MODE, '');
                return true;
            } else {
                return false;
            }
        })();

    w20Object = Utils.mergeObjects(w20Object, window.w20 || {});

    if (typeof w20Object.configuration === 'undefined') {
        var htmlElt = window.document.getElementsByTagName('html'),
            attr;

        if (htmlElt.length > 0) {
            if ((attr = htmlElt[0].getAttribute('data-w20-app')) !== null) {
                w20Object.configuration = (attr === '' ? 'w20.app.json' : attr);
            }

            if ((attr = htmlElt[0].getAttribute('data-w20-app-version')) !== null) {
                w20Object.appVersion = attr;
            }

            if ((attr = htmlElt[0].getAttribute('data-w20-timeout')) !== null) {
                var timeout = parseInt(attr);

                if (isNaN(timeout)) {
                    report('warn', 'unable to parse data-w20-timeout value, using default timeout');
                } else {
                    w20Object.requireConfig.waitSeconds = timeout;
                }
            }

            if ((attr = htmlElt[0].getAttribute('data-w20-bundles')) !== null) {
                useBundles = (attr !== 'false');
            }

            if ((attr = htmlElt[0].getAttribute('data-w20-cors-with-credentials')) !== null) {
                w20Object.corsWithCredentials = (attr !== 'false');
            }
        }
    }

    SystemJS.config(w20Object.requireConfig);

    /////////////////////////////////////////////////////////////////////
    // BOOTSTRAP FUNCTIONS                                             //
    /////////////////////////////////////////////////////////////////////

    var loadingScreen = (function () {
        return {
            enable: function (w20) {
                var cloak = window.document.getElementById('w20-loading-cloak');
                if (cloak !== null) {
                    cloak.style.display = '';
                }
            },

            disable: function () {
                var cloak = window.document.getElementById('w20-loading-cloak');
                if (cloak !== null) {
                    cloak.parentNode.removeChild(cloak);
                }
            }
        };
    })();

    var requireErrorHandler = (function () {
        var originalHandler;

        return {
            setup: function () {
                if (originalHandler === 'undefined') {
                    originalHandler = require.onError;
                }

                require.onError = function (err) {
                    var info = {
                        message: err.message,
                        stack: err.stack,
                        details: formatError(err),
                        modules: err.requireModules
                    };

                    if (typeof err.requireType !== 'undefined') {
                        info.type = err.requireType;
                    } else if (typeof err.xhr !== 'undefined' && err.xhr.status / 100 !== 2) {
                        info.type = 'http';
                        info.status = err.xhr.status;
                        info.statusText = err.xhr.statusText;
                        info.response = err.xhr.responseText;
                    } else {
                        info.type = 'unknown';
                    }

                    report('error', 'A loading error occurred', info.details, true, info);
                };
            },

            restore: function () {
                require.onError = originalHandler;
            },

            disable: function () {
                require.onError = function () {
                };
            }
        };
    })();

    /////////////////////////////////////////////////////////////////////
    // APPLICATION STARTUP FUNCTION                                    //
    /////////////////////////////////////////////////////////////////////

    var requireApplication = (function () {
        return function (w20, modulesToRequire, callback) {
            console.log('Requiring modules ' + modulesToRequire);

            require(['{tv4}/tv4'].concat(modulesToRequire), function (tv4) {
                var definedModules = SystemJS._loader.modules,
                    modulesRequired = Object.keys(definedModules).map(function (elt) {
                        return definedModules[elt].module;
                    }).filter(function (elt) {
                        return elt !== undefined;
                    });

                modulesRequired.forEach(module => {
                    if (module.init) {
                        module.init(w20);
                    }
                });

                // Validate configuration now that the validator (tv4) is loaded
                console.log('Validating modules configuration');

                for (var fragmentName in allModules) {
                    if (allModules.hasOwnProperty(fragmentName)) {
                        for (var moduleName in allModules[fragmentName]) {
                            if (allModules[fragmentName].hasOwnProperty(moduleName)) {
                                var validationData = allModules[fragmentName][moduleName];

                                if (typeof validationData.values !== 'undefined' && typeof validationData.schema !== 'undefined') {
                                    var validationResult = tv4.validateMultiple(validationData.values, validationData.schema);

                                    if (!validationResult.valid) {
                                        // jshint loopfunc:true
                                        report('error', 'Configuration of module ' + moduleName + ' in fragment ' + fragmentName + ' is not valid', function () {
                                            var result = '';
                                            for (var i = 0; i < validationResult.errors.length; i++) {
                                                var currentError = validationResult.errors[i];
                                                result += (currentError.dataPath) +
                                                    ': ' +
                                                    currentError.message +
                                                    '\n';
                                            }

                                            result += '\n' + formatJsonSchema(validationData.schema);

                                            return result;
                                        }, true);
                                    }
                                }
                            }
                        }
                    }
                }

                callback(modulesToRequire, modulesRequired);
            });
        };
    })();

    var startApplication = (function () {
        return function (w20, modulesToRequire, modules, callback) {
            var currentTimeout = null,
                preModules = {},
                runModules = {};

            // Push dummy module on the list to ensure the full lifecycle chain is called
            modules.push({
                lifecycle: {
                    pre: function (modules, fragments, callback) {
                        callback();
                    },
                    run: function (modules, fragments, callback) {
                        callback();
                    },
                    post: function (modules, fragments, callback) {
                        callback();
                    }
                }
            });

            var preModuleCount = 0,
                runModuleCount = 0,
                postModuleCount = 0;


            // Pre calculate total module count for progress bar display
            for (var c = 0; c < modules.length; c++) {
                if (modules[c] && modules[c].lifecycle) {
                    if (typeof modules[c].lifecycle.pre === 'function') {
                        preModuleCount = preModuleCount + 1;
                        if (typeof modulesToRequire[c] !== 'undefined') {
                            preModules[modulesToRequire[c]] = '';
                        }
                    }
                    if (typeof modules[c].lifecycle.run === 'function') {
                        runModuleCount = runModuleCount + 1;
                        if (typeof modulesToRequire[c] !== 'undefined') {
                            runModules[modulesToRequire[c]] = '';
                        }
                    }
                    if (typeof modules[c].lifecycle.post === 'function') {
                        postModuleCount = postModuleCount + 1;
                    }
                }
            }

            currentTimeout = window.setTimeout(function () {
                report('error', 'Timeout during preparation phase !', function () {
                    var list = '';
                    for (var theModule in preModules) {
                        if (preModules.hasOwnProperty(theModule)) {
                            list += '\t' + theModule + '\n';
                        }
                    }
                    return 'Modules not prepared:\n' + list.toString();
                });
            }, w20Object.requireConfig.waitSeconds * 1000);

            try {
                for (var i = 0; i < modules.length; i++) {
                    if (modules[i] && modules[i].lifecycle && typeof modules[i].lifecycle.pre === 'function') {
                        // jshint loopfunc:true
                        modules[i].lifecycle.pre(modules, w20.fragments, function (preModule) {
                            preModuleCount = preModuleCount - 1;
                            if (typeof preModule !== 'undefined') {
                                console.log(preModule.id + ' module pre phase completed');
                                delete preModules[preModule.id];
                            }

                            if (preModuleCount === 0) {
                                window.clearTimeout(currentTimeout);
                                preModules = undefined;

                                currentTimeout = window.setTimeout(function () {
                                    report('error', 'Timeout during running phase !', function () {
                                        var list = '';
                                        for (var theModule in runModules) {
                                            if (runModules.hasOwnProperty(theModule)) {
                                                list += '<li>' + theModule + '</li>';
                                            }
                                        }
                                        return 'Modules not runned:<br/><ul>' + list.toString() + '</ul>';
                                    });
                                }, w20Object.requireConfig.waitSeconds * 1000);

                                try {
                                    for (var j = 0; j < modules.length; j++) {
                                        if (modules[j] && modules[j].lifecycle && typeof modules[j].lifecycle.run === 'function') {
                                            // jshint loopfunc:true
                                            modules[j].lifecycle.run(modules, w20.fragments, function (runModule) {
                                                runModuleCount = runModuleCount - 1;
                                                if (typeof runModule !== 'undefined') {
                                                    console.log(runModule.id + ' module run phase completed');
                                                    delete runModules[runModule.id];
                                                }

                                                if (runModuleCount === 0) {
                                                    window.clearTimeout(currentTimeout);
                                                    runModules = undefined;

                                                    callback();

                                                    for (var k = 0; k < modules.length; k++) {
                                                        if (modules[k] && modules[k].lifecycle && typeof modules[k].lifecycle.post === 'function') {
                                                            // jshint loopfunc:true
                                                            modules[k].lifecycle.post(modules, w20.fragments, function (postModule) {
                                                                postModuleCount = postModuleCount - 1;
                                                                if (typeof postModule !== 'undefined') {
                                                                    console.log(postModule.id + ' module post phase completed');
                                                                }
                                                            }, report);
                                                        }
                                                    }
                                                }
                                            }, report);
                                        }
                                    }
                                } catch (e) {
                                    report(e);
                                }
                            }
                        }, report);
                    }
                }
            } catch (e) {
                report(e);
            }
        };
    })();

    /////////////////////////////////////////////////////////////////////
    // CONFIGURATION FUNCTIONS                                         //
    /////////////////////////////////////////////////////////////////////

    var loadConfiguration = (function () {
        return function (callback) {
            function initialize(config) {
                var fragmentsToLoad = [],
                    fragmentConfigs = [],
                    loadedFragments = {},
                    modulesToLoad = [],
                    loadedConfiguration;

                if (w20Object.appVersion) {
                    w20Object.requireConfig.urlArgs = '__v=' + w20Object.appVersion;
                }

                if (typeof config === 'object') {
                    loadedConfiguration = config;
                } else if (typeof config === 'string') {
                    try {
                        loadedConfiguration = JSON.parse(Utils.replacePlaceholders(config, function (value, defaultValue) {
                            var result = window.localStorage.getItem(value);

                            if (result === null) {
                                if (typeof defaultValue === 'undefined') {
                                    return undefined;
                                } else {
                                    window.localStorage.setItem(value, defaultValue);
                                    return defaultValue;
                                }
                            }
                            return result;
                        }));
                    } catch (e) {
                        report('error', 'Error when parsing configuration', function () {
                            return formatError(e);
                        }, true);
                    }
                } else {
                    report('error', 'W20 configuration must be be defined either as a "configuration" object in the "w20" global object or as an URL to fetch in the "data-w20-app" attribute of the "html" element', undefined, true);
                }

                for (var fragment in loadedConfiguration) {
                    if (loadedConfiguration.hasOwnProperty(fragment)) {
                        var fragmentLoadedConfiguration = loadedConfiguration[fragment];

                        if (typeof fragmentLoadedConfiguration !== 'object') {
                            report('error', 'Configuration of fragment ' + fragment + ' is not of object type', undefined, true);
                        }

                        if (fragment === '') {
                            // anonymous inline fragment
                            loadedFragments[''] = {
                                definition: Utils.mergeObjects(fragmentLoadedConfiguration, {id: ''}),
                                configuration: {}
                            };
                        } else {
                            // named external fragment
                            if (fragmentLoadedConfiguration.ignore) {
                                console.warn("Ignored fragment " + fragment);
                            } else {
                                fragmentsToLoad.push(fragment);
                                fragmentConfigs.push(fragmentLoadedConfiguration);
                            }
                        }
                    }
                }

                // Load all fragments
                Utils.getContents(fragmentsToLoad, w20Object.corsWithCredentials, function (manifests) {
                    var hasErrors = false;

                    for (var i = 0; i < manifests.length; i++) {
                        var __fragmentUrl = fragmentsToLoad[i],
                            __fragmentRoot = __fragmentUrl.substring(0, __fragmentUrl.lastIndexOf('/')),
                            __fragmentConfig = fragmentConfigs[i],
                            __fragmentDefinition;

                        try {
                            __fragmentDefinition = JSON.parse(Utils.replacePlaceholders(manifests[i], Utils.mergeObjects(__fragmentConfig.vars || {}, {fragmentRoot: __fragmentRoot})));
                        } catch (e) {
                            // jshint loopfunc:true
                            report('error', 'invalid fragment manifest at ' + __fragmentUrl, function () {
                                return formatError(e);
                            });
                            hasErrors = true;
                            continue;
                        }

                        if (typeof __fragmentDefinition.id !== 'string' || __fragmentDefinition.id === '') {
                            report('error', 'invalid or missing fragment id at ' + __fragmentUrl);
                            hasErrors = true;
                            continue;
                        }

                        if (__fragmentDefinition.id in loadedFragments) {
                            report('error', 'fragment identifier conflict: ' + __fragmentDefinition.id);
                            hasErrors = true;
                            continue;
                        }

                        loadedFragments[__fragmentDefinition.id] = {
                            definition: __fragmentDefinition,
                            configuration: __fragmentConfig,
                            root: __fragmentRoot,
                            url: __fragmentUrl
                        };
                    }

                    for (var loadedFragment in loadedFragments) {
                        if (loadedFragments.hasOwnProperty(loadedFragment)) {
                            var fragmentDefinition = loadedFragments[loadedFragment].definition,
                                fragmentConfiguration = loadedFragments[loadedFragment].configuration,
                                fragmentUrl = loadedFragments[loadedFragment].url,
                                fragmentRoot = loadedFragments[loadedFragment].root;

                            allModules[loadedFragment] = {};

                            if (typeof fragmentDefinition.requireConfig !== 'undefined') {
                                Utils.mergeObjects(w20Object.requireConfig, fragmentDefinition.requireConfig || {});
                            }

                            w20Object.requireConfig.paths['{' + fragmentDefinition.id + '}/*'] = (fragmentRoot || '.') + '/*';

                            var declaredModules = fragmentDefinition.modules || {},
                                configuredModules = fragmentConfiguration.modules || {};

                            // Check for non-existent configured modules
                            for (var configuredModule in configuredModules) {
                                if (configuredModules.hasOwnProperty(configuredModule)) {
                                    if (typeof declaredModules[configuredModule] === 'undefined') {
                                        report('error', 'module ' + configuredModule + ' has been configured but doesn\'t exist in fragment ' + fragmentDefinition.id);
                                        hasErrors = true;
                                    }
                                }
                            }

                            for (var module in declaredModules) {
                                if (declaredModules.hasOwnProperty(module)) {
                                    var moduleDefinition = declaredModules[module],
                                        moduleConfiguration = configuredModules[module],
                                        modulePath,
                                        configSchema;

                                    // Module definition shortcut without configuration
                                    if (typeof moduleDefinition === 'string') {
                                        w20Object.requireConfig.config[moduleDefinition] = moduleConfiguration || {};

                                        configSchema = undefined;

                                        if (typeof moduleConfiguration !== 'undefined') {
                                            modulePath = moduleDefinition;
                                        } else {
                                            modulePath = undefined;
                                        }
                                    }
                                    // Full module definition
                                    else if (typeof moduleDefinition === 'object') {
                                        w20Object.requireConfig.config[moduleDefinition.path] = Utils.mergeObjects(moduleDefinition.config || {}, moduleConfiguration || {});


                                        if (typeof moduleConfiguration !== 'undefined' || moduleDefinition.autoload) {
                                            modulePath = moduleDefinition.path;
                                            configSchema = moduleDefinition.configSchema;
                                        } else {
                                            modulePath = undefined;
                                            configSchema = undefined;
                                        }
                                    } else {
                                        report('error', 'module ' + module + ' has an invalid definition in fragment: ' + fragmentDefinition.id, undefined, true);
                                    }

                                    // Load module if necessary
                                    if (modulePath && moduleConfiguration !== false) {
                                        allModules[loadedFragment][module] = {
                                            values: moduleConfiguration,
                                            schema: configSchema
                                        };
                                        modulesToLoad.push(modulePath);
                                    }
                                }
                            }

                            if (useBundles && typeof fragmentDefinition.bundles !== 'undefined') {
                                Utils.mergeObjects(w20Object.requireConfig.bundles, fragmentDefinition.bundles);
                            }

                            console.log('Fragment ' + (fragmentDefinition.name || '[inline]') + ' configured' + (fragmentUrl ? ' from ' + fragmentUrl : ''));
                        }
                    }

                    if (hasErrors) {
                        report('error', 'Configuration error(s) occurred, cannot continue', undefined, true);
                    }

                    define('w20', function () {
                        return w20Object;
                    });

                    SystemJS.config(w20Object.requireConfig);

                    w20Object.configuration = loadedConfiguration;
                    w20Object.fragments = loadedFragments;

                    callback(w20Object, modulesToLoad);
                }, function (error, index) {
                    if (fragmentConfigs[index].optional) {
                        report('warn', "Could not load optional fragment " + fragmentsToLoad[index]);
                    } else {
                        report('error', 'Could not load fragment ' + fragmentsToLoad[index], undefined, true);
                    }
                });
            }

            if (typeof w20Object.configuration === 'string') {
                Utils.getContents(w20Object.configuration, w20Object.corsWithCredentials, function (configText) {
                    initialize(configText);
                }, function () {
                    report('error', 'Could not fetch W20 configuration from ' + w20Object.configuration, undefined, true);
                });
            } else {
                initialize(w20Object.configuration);
            }
        };
    })();

    /////////////////////////////////////////////////////////////////////
    // STARTUP SEQUENCE                                                //
    /////////////////////////////////////////////////////////////////////
    if (w20Object.debug) {
        console.warn('Debug mode is on');
    } else {
        var noop = function () {
        };
        console.log = noop;
        console.trace = noop;
        console.time = noop;
        console.timeEnd = noop;
    }

    requireErrorHandler.setup();

    console.info('W20 application starting up');
    console.time('Startup process duration');
    console.time('Configuration load duration');
    loadConfiguration(function (w20, modules) {
        console.timeEnd('Configuration load duration');

        window.w20 = w20Object;
        loadingScreen.enable(w20);

        modules = modules.concat(w20Object.deps || []);

        console.time('Modules require duration');
        requireApplication(w20, modules, w20Object.callback || function (modulesToRequire, modulesRequired) {
                console.timeEnd('Modules require duration');

                console.time('Application initialization duration');
                startApplication(w20, modulesToRequire, modulesRequired, function () {
                    console.timeEnd('Application initialization duration');

                    requireErrorHandler.restore(w20);
                    loadingScreen.disable(w20);

                    w20Object.ready = true;

                    if (typeof window.jQuery !== 'undefined') {
                        window.jQuery(window.document).trigger('w20ready');
                    }

                    console.info('W20 application ready');
                    console.timeEnd('Startup process duration');
                });
            });
    });
