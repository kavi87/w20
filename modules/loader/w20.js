/*
 * Copyright (c) 2013-2016, The SeedStack authors <http://seedstack.org>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

function mergeObjects(target, source) {
    Object.keys(source).forEach(p => {
        try {
            if (source[p].constructor === Object) {
                target[p] = mergeObjects(target[p], source[p]);
            } else if (Array.isArray(source[p]) && Array.isArray(target[p])) {
                target[p] = target[p].concat(source[p]);
            } else {
                target[p] = source[p];
            }
        } catch (e) {
            target[p] = source[p];
        }
    });
    return target;
}

function replacePlaceholders(text, values, placeholderRegexp = new RegExp('\\${([\\w-]+)(:([^:}]*))?}', 'g') /* ${letname:defaultvalue} */) {
    return text.replace(placeholderRegexp, (all, letname, secondpart, defaultvalue) => {
        let replacement = (typeof values === 'function' ? values(letname, defaultvalue) : values[letname]);

        if (typeof replacement === 'undefined' && typeof defaultvalue === 'undefined') {
            throw new Error('unresolved letiable: ${' + letname + '}');
        }

        return replacement || defaultvalue || '';
    });
}

let formatJsonSchema = (() => {
    function shift(value, level) {
        let tabs = '';
        for (let i = 0; i < level; i++) {
            tabs += '\t';
        }
        return tabs + value;
    }

    function buildConfigurationDescription(node, level) {
        let output = '';

        if (node.properties) {
            let properties = node.properties;
            Object.keys(properties).forEach(property => {
                output += shift(property + ' (' + properties[property].type + '): ' + properties[property].description + '\n', level);
                output += buildConfigurationDescription(properties[property], level + 1);
            });
        } else if (node.items) {
            let items = node.items;
            output += shift('Item type: ' + items.type + '\n', level);
            output += buildConfigurationDescription(items, level + 1);
        }

        return output;
    }

    return jsonSchema => {
        return jsonSchema.title + ':\n' + buildConfigurationDescription(jsonSchema, 1);
    };
})();

function getCookie(name) {
    let c = document.cookie, v = 0, cookies = {};
    if (document.cookie.match(/^\s*\$Version=(?:"1"|1);\s*(.*)/)) {
        c = RegExp.$1;
        v = 1;
    }
    if (v === 0) {
        c.split(/[,;]/).map(cookie => {
            let parts = cookie.split(/=/, 2),
                name = decodeURIComponent(parts[0].replace(/^\s+/, ""));
            cookies[name] = parts.length > 1 ? decodeURIComponent(parts[1].replace(/\s+$/, "")) : null;
        });
    } else {
        c.match(/(?:^|\s+)([!#$%&'*+\-.0-9A-Z^`a-z|~]+)=([!#$%&'*+\-.0-9A-Z^`a-z|~]*|"(?:[\x20-\x7E\x80\xFF]|\\[\x00-\x7F])*")(?=\s*[,;]|$)/g).map(($0, $1) => {
            cookies[$0] = $1.charAt(0) === '"' ? $1.substr(1, -1).replace(/\\(.)/g, "$1") : $1;
        });
    }
    return cookies[name];
}

function fetch(url) {
    return new Promise((resolve, reject) => {

        let xhr = new XMLHttpRequest(),
            xsrfToken = getCookie('XSRF-TOKEN');

        xhr.open('GET', url, true);

        // Allow overrides specified in config
        if ('withCredentials' in xhr) {
            xhr.withCredentials = w20Object.corsWithCredentials;
        }

        // Put the XSRF header if the token is available
        if (xsrfToken) {
            xhr.setRequestHeader("X-XSRF-TOKEN", xsrfToken);
        }

        xhr.onreadystatechange = function () {
            let status, err;
            //Do not explicitly handle errors, those should be
            //visible via console output in the browser.
            if (xhr.readyState === 4) {
                status = xhr.status || 0;
                if (status > 399 && status < 600) {
                    //An http 4xx or 5xx error. Signal an error.
                    err = new Error(url + ' HTTP status: ' + status);
                    err.xhr = xhr;
                    reject(err);
                } else {
                    resolve(xhr.responseText);
                }
            }
        };
        xhr.send(null);
    });
}

function getContents(urls, callback, errback) {
    errback = errback ? errback : e => {
        throw e
    };

    // TODO polyfill Promise
    if (urls instanceof Array) {
        Promise.all(urls.map(fetch).map((promise, index) => promise.catch(e => errback(e, index)))).then(callback);
    } else {
        fetch(urls).then(result => callback(result, 0)).catch(err => errback(err, 0));
    }
}

function formatError(arg) {
    if (arg instanceof Error) {
        if (arg.stack) {
            arg = (arg.message && arg.stack.indexOf(arg.message) === -1) ? 'Error: ' + arg.message + '\n' + arg.stack : arg.stack;
        } else if (arg.sourceURL) {
            arg = arg.message + '\n' + arg.sourceURL + ':' + arg.line;
        }
    }
    return arg;
}

let requireErrorHandler = (() => {
    let originalHandler;

    return {
        setup: function () {
            if (!originalHandler) {
                this.originalHandler = require.onError;
            }

            require.onError = function (err) {
                let info = {
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
            require.onError = this.originalHandler;
        },

        disable: function () {
            require.onError = function () {
            };
        }
    };
})();

// TODO refactor too big
let report = (() => {
    let errorLevel = null;

    return (type, message, detail, isFatal, info) => {
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

        let constrainedType = {info: 'info', warn: 'warn', error: 'error'}[type] || 'error',
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

            let detailListElement = window.document.getElementById('w20-error-detail-list'),
                detailElement = window.document.getElementById('w20-error-detail');
            detailListElement.innerHTML = detailListElement.innerHTML + '<li>[' + constrainedType.substring(0, 1).toUpperCase() + '] ' + message + (typeof detailContent !== 'undefined' ? ' <blockquote>' + detailContent.replace(/\n/g, '<br/>').replace(/\t/g, '&emsp;&emsp;') + '</blockquote>' : '') + '</li>';
            detailElement.scrollTop = detailElement.scrollHeight;
        }

        if (isFatal) {
            if (typeof info !== 'undefined') {
                let errorpage = info.path;
                if (typeof errorpage === 'undefined') {
                    errorpage = 'errors/' + (info.type || 'unknown') + (info.type === 'http' ? '-' + (info.status || 'unknown') : '') + '.html';
                }

                getContents(errorpage, function (errorContent) {
                    let errorDocument = window.document.open('text/html', 'replace');
                    try {
                        errorDocument.write(replacePlaceholders(errorContent, info));
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

function getDocumentConfiguration(htmlElt = window.document.getElementsByTagName('html')) {
    let attr;
    let documentConfiguration = { requireConfig: {} };

    if (htmlElt.length > 0) {
        if ((attr = htmlElt[0].getAttribute('data-w20-app')) !== null) {
            documentConfiguration.configuration = (attr === '' ? 'w20.app.json' : attr);
        }

        if ((attr = htmlElt[0].getAttribute('data-w20-app-version')) !== null) {
            documentConfiguration.appVersion = attr;
            if (documentConfiguration.appVersion) {
                documentConfiguration.requireConfig.urlArgs = createCacheBustingExtension(documentConfiguration.appVersion);
            }
        }

        if ((attr = htmlElt[0].getAttribute('data-w20-timeout')) !== null) {
            let timeout = parseInt(attr);

            if (isNaN(timeout)) {
                report('warn', 'unable to parse data-w20-timeout value, using default timeout');
            } else {
                documentConfiguration.requireConfig.waitSeconds = timeout;
            }
        }

        if ((attr = htmlElt[0].getAttribute('data-w20-bundles')) !== null) {
            documentConfiguration.useBundles = (attr !== 'false');
        }

        if ((attr = htmlElt[0].getAttribute('data-w20-cors-with-credentials')) !== null) {
            documentConfiguration.corsWithCredentials = (attr !== 'false');
        }
    }

    return documentConfiguration;
}

function createCacheBustingExtension (ext) {
    return '__v=' + ext;
}

/////////////////////////////////////////////////////////////////////
// CONFIGURATION FUNCTIONS                                         //
/////////////////////////////////////////////////////////////////////

function loadConfiguration (callback) {

    function initialize (config) {
        let fragmentsToLoad = [],
            fragmentConfigs = [],
            loadedFragments = {},
            modulesToLoad = [],
            loadedConfiguration;

        if (typeof config === 'object') {
            loadedConfiguration = config;
        } else if (typeof config === 'string') {
            try {
                loadedConfiguration = JSON.parse(replacePlaceholders(config, function (value, defaultValue) {
                    let result = window.localStorage.getItem(value);

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

        for (let fragment in loadedConfiguration) {
            if (loadedConfiguration.hasOwnProperty(fragment)) {
                let fragmentLoadedConfiguration = loadedConfiguration[fragment];

                if (typeof fragmentLoadedConfiguration !== 'object') {
                    report('error', 'Configuration of fragment ' + fragment + ' is not of object type', undefined, true);
                }

                if (fragment === '') {
                    // anonymous inline fragment
                    loadedFragments[''] = {
                        definition: mergeObjects(fragmentLoadedConfiguration, {id: ''}),
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
        getContents(fragmentsToLoad, function (manifests) {
            let hasErrors = false;

            for (let i = 0; i < manifests.length; i++) {
                let __fragmentUrl = fragmentsToLoad[i],
                    __fragmentRoot = __fragmentUrl.substring(0, __fragmentUrl.lastIndexOf('/')),
                    __fragmentConfig = fragmentConfigs[i],
                    __fragmentDefinition;

                try {
                    __fragmentDefinition = JSON.parse(replacePlaceholders(manifests[i], mergeObjects(__fragmentConfig.lets || {}, {fragmentRoot: __fragmentRoot})));
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

            for (let loadedFragment in loadedFragments) {
                if (loadedFragments.hasOwnProperty(loadedFragment)) {
                    let fragmentDefinition = loadedFragments[loadedFragment].definition,
                        fragmentConfiguration = loadedFragments[loadedFragment].configuration,
                        fragmentUrl = loadedFragments[loadedFragment].url,
                        fragmentRoot = loadedFragments[loadedFragment].root;

                    allModules[loadedFragment] = {};

                    if (typeof fragmentDefinition.requireConfig !== 'undefined') {
                        mergeObjects(w20Object.requireConfig, fragmentDefinition.requireConfig || {});
                    }

                    w20Object.requireConfig.paths['{' + fragmentDefinition.id + '}/*'] = (fragmentRoot || '.') + '/*';

                    let declaredModules = fragmentDefinition.modules || {},
                        configuredModules = fragmentConfiguration.modules || {};

                    // Check for non-existent configured modules
                    for (let configuredModule in configuredModules) {
                        if (configuredModules.hasOwnProperty(configuredModule)) {
                            if (typeof declaredModules[configuredModule] === 'undefined') {
                                report('error', 'module ' + configuredModule + ' has been configured but doesn\'t exist in fragment ' + fragmentDefinition.id);
                                hasErrors = true;
                            }
                        }
                    }

                    for (let module in declaredModules) {
                        if (declaredModules.hasOwnProperty(module)) {
                            let moduleDefinition = declaredModules[module],
                                moduleConfiguration = configuredModules[module],
                                modulePath,
                                configSchema;

                            // Module definition shortcut without configuration
                            if (typeof moduleDefinition === 'string') {
                                w20Object.requireConfig.modulesConfig[moduleDefinition] = moduleConfiguration || {};

                                configSchema = undefined;

                                if (typeof moduleConfiguration !== 'undefined') {
                                    modulePath = moduleDefinition;
                                } else {
                                    modulePath = undefined;
                                }
                            }
                            // Full module definition
                            else if (typeof moduleDefinition === 'object') {
                                w20Object.requireConfig.modulesConfig[moduleDefinition.path] = mergeObjects(moduleDefinition.config || {}, moduleConfiguration || {});


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

                    if (w20Object.useBundles && typeof fragmentDefinition.bundles !== 'undefined') {
                        mergeObjects(w20Object.requireConfig.bundles, fragmentDefinition.bundles);
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
        getContents(w20Object.configuration, function (configText) {
            initialize(configText);
        }, function () {
            report('error', 'Could not fetch W20 configuration from ' + w20Object.configuration, undefined, true);
        });
    } else {
        initialize(w20Object.configuration);
    }

}

/////////////////////////////////////////////////////////////////////
// APPLICATION STARTUP FUNCTION                                    //
/////////////////////////////////////////////////////////////////////

let requireApplication = function (w20, modulesToRequire, callback) {
    console.log('Requiring modules ' + modulesToRequire);

    require(['{tv4}/tv4'].concat(modulesToRequire), function (tv4) {
        let definedModules = SystemJS._loader.modules,
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

        for (let fragmentName in allModules) {
            if (allModules.hasOwnProperty(fragmentName)) {
                for (let moduleName in allModules[fragmentName]) {
                    if (allModules[fragmentName].hasOwnProperty(moduleName)) {
                        let validationData = allModules[fragmentName][moduleName];

                        if (typeof validationData.values !== 'undefined' && typeof validationData.schema !== 'undefined') {
                            let validationResult = tv4.validateMultiple(validationData.values, validationData.schema);

                            if (!validationResult.valid) {
                                // jshint loopfunc:true
                                report('error', 'Configuration of module ' + moduleName + ' in fragment ' + fragmentName + ' is not valid', function () {
                                    let result = '';
                                    for (let i = 0; i < validationResult.errors.length; i++) {
                                        let currentError = validationResult.errors[i];
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
    }, function (error) {
        console.trace();
        console.log(error);
    });
};


let startApplication = function (w20, modulesToRequire, modules, callback) {
    let currentTimeout = null,
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

    let preModuleCount = 0,
        runModuleCount = 0,
        postModuleCount = 0;


    // Pre calculate total module count for progress bar display
    for (let c = 0; c < modules.length; c++) {
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
            let list = '';
            for (let theModule in preModules) {
                if (preModules.hasOwnProperty(theModule)) {
                    list += '\t' + theModule + '\n';
                }
            }
            return 'Modules not prepared:\n' + list.toString();
        });
    }, w20Object.requireConfig.waitSeconds * 1000);

    try {
        for (let i = 0; i < modules.length; i++) {
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
                                let list = '';
                                for (let theModule in runModules) {
                                    if (runModules.hasOwnProperty(theModule)) {
                                        list += '<li>' + theModule + '</li>';
                                    }
                                }
                                return 'Modules not runned:<br/><ul>' + list.toString() + '</ul>';
                            });
                        }, w20Object.requireConfig.waitSeconds * 1000);

                        try {
                            for (let j = 0; j < modules.length; j++) {
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

                                            for (let k = 0; k < modules.length; k++) {
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

/////////////////////////////////////////////////////////////////////
// STARTUP SEQUENCE                                                //
/////////////////////////////////////////////////////////////////////

let defaultConfiguration = {
    console: window.console,
    requireConfig: {
        baseUrl: '.',
        modulesConfig: {
            '{requirejs-text}/text': {
                onXhr: function (xhr) {
                    let xsrfToken = getCookie('XSRF-TOKEN');

                    if ('withCredentials' in xhr) {
                        xhr.withCredentials = this.corsWithCredentials;
                    }

                    if (xsrfToken) {
                        xhr.setRequestHeader("X-XSRF-TOKEN", xsrfToken);
                    }
                },

                useXhr: () => true
            }
        },
        paths: {},
        map: {},
        bundles: {},
        waitSeconds: 30,
        urlArgs: createCacheBustingExtension(this.appVersion)
    },
    appVersion: '0.1.0',
    ready: false,
    corsWithCredentials: false,
    useBundles: false
};

let allModules = {};
// TODO insert hook here to allow initializing window.w20
let w20Object = mergeObjects(mergeObjects(defaultConfiguration, getDocumentConfiguration()), window.w20 || {});

SystemJS.config(w20Object.requireConfig);

//requireErrorHandler.setup();

console.info('W20 application starting up');
console.time('Startup process duration');
console.time('Configuration load duration');
loadConfiguration(function (w20, modules) {
    console.timeEnd('Configuration load duration');

    window.w20 = w20Object;

    modules = modules.concat(w20Object.deps || []);

    console.time('Modules require duration');
    requireApplication(w20, modules, w20Object.callback || function (modulesToRequire, modulesRequired) {
            console.timeEnd('Modules require duration');

            console.time('Application initialization duration');
            startApplication(w20, modulesToRequire, modulesRequired, function () {
                console.timeEnd('Application initialization duration');

                //requireErrorHandler.restore(w20);

                w20Object.ready = true;

                if (typeof window.jQuery !== 'undefined') {
                    window.jQuery(window.document).trigger('w20ready');
                }

                console.info('W20 application ready');
                console.timeEnd('Startup process duration');
            });
        });
});

export { w20Object };
