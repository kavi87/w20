/*
 * Copyright (c) 2013-2016, The SeedStack authors <http://seedstack.org>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export default {
    mergeObjects,
    replacePlaceholders,
    getCookie,
    getContents,
    formatError
};

// Merge obj2 into obj1 or concatenate arrays
function mergeObjects(obj1, obj2) {
    for (var p in obj2) {
        if (obj2.hasOwnProperty(p)) {
            try {
                if (obj2[p].constructor === Object) {
                    obj1[p] = mergeObjects(obj1[p], obj2[p]);
                } else if (obj2[p].constructor === Array && obj1[p].constructor === Array) {
                    obj1[p] = obj1[p].concat(obj2[p]);
                } else {
                    obj1[p] = obj2[p];
                }
            } catch (e) {
                obj1[p] = obj2[p];
            }
        }
    }
    return obj1;
}

// Replace placeholders of the ${varname:defaultvalue} form
const placeholderRegexp = new RegExp('\\${([\\w-]+)(:([^:}]*))?}', 'g');

function replacePlaceholders(text, values) {
    return text.replace(placeholderRegexp, function (all, varname, secondpart, defaultvalue) {
        var replacement = (typeof values === 'function' ? values(varname, defaultvalue) : values[varname]);

        if (typeof replacement === 'undefined' && typeof defaultvalue === 'undefined') {
            throw new Error('unresolved variable: ${' + varname + '}');
        }

        return replacement || defaultvalue || '';
    });
}


function getCookie(name) {
    var c = document.cookie, v = 0, cookies = {};
    if (document.cookie.match(/^\s*\$Version=(?:"1"|1);\s*(.*)/)) {
        c = RegExp.$1;
        v = 1;
    }
    if (v === 0) {
        c.split(/[,;]/).map(function (cookie) {
            var parts = cookie.split(/=/, 2),
                name = decodeURIComponent(parts[0].replace(/^\s+/, ""));
            cookies[name] = parts.length > 1 ? decodeURIComponent(parts[1].replace(/\s+$/, "")) : null;
        });
    } else {
        c.match(/(?:^|\s+)([!#$%&'*+\-.0-9A-Z^`a-z|~]+)=([!#$%&'*+\-.0-9A-Z^`a-z|~]*|"(?:[\x20-\x7E\x80\xFF]|\\[\x00-\x7F])*")(?=\s*[,;]|$)/g).map(function ($0, $1) {
            cookies[$0] = $1.charAt(0) === '"' ? $1.substr(1, -1).replace(/\\(.)/g, "$1") : $1;
        });
    }
    return cookies[name];
}

function fetch(url, index, withCredentials, callback, errback) {
    var xhr = new XMLHttpRequest(),
        xsrfToken = getCookie('XSRF-TOKEN');

    xhr.open('GET', url, true);

    // Allow overrides specified in config
    if ('withCredentials' in xhr) {
        xhr.withCredentials = withCredentials;
    }

    // Put the XSRF header if the token is available
    if (xsrfToken) {
        xhr.setRequestHeader("X-XSRF-TOKEN", xsrfToken);
    }

    xhr.onreadystatechange = function () {
        var status, err;
        //Do not explicitly handle errors, those should be
        //visible via console output in the browser.
        if (xhr.readyState === 4) {
            status = xhr.status || 0;
            if (status > 399 && status < 600) {
                //An http 4xx or 5xx error. Signal an error.
                err = new Error(url + ' HTTP status: ' + status);
                err.xhr = xhr;
                errback(err, index);
            } else {
                callback(xhr.responseText, index);
            }
        }
    };
    xhr.send(null);
}

// This function retrieve the contents of multiple resources asynchronously
function getContents(urls, withCredentials, callback, errback) {
    var count = urls.length,
        results = [];

    function success(data, index) {
        results[index] = data;
        if (--count === 0) {
            callback(results);
        }
    }

    function failure(err, index) {
        if (typeof errback === 'function') {
            errback(err, index);
            if (--count === 0) {
                callback(results);
            }
        } else {
            throw err;
        }
    }

    if (urls instanceof Array) {
        for (var i = 0; i < count; i++) {
            fetch(urls[i], i, withCredentials, success, failure);
        }
    } else {
        fetch(urls, 0, withCredentials, function (data, index) {
            callback(data, index);
        }, function (err, index) {
            if (typeof errback === 'function') {
                errback(err, index);
            }
        });
    }
}

// This function formats Error objects in a human readable string
function formatError (arg) {
    if (arg instanceof Error) {
        if (arg.stack) {
            arg = (arg.message && arg.stack.indexOf(arg.message) === -1) ? 'Error: ' + arg.message + '\n' + arg.stack : arg.stack;
        } else if (arg.sourceURL) {
            arg = arg.message + '\n' + arg.sourceURL + ':' + arg.line;
        }
    }
    return arg;
}

