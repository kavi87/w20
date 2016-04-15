/*
 * Copyright (c) 2015-2016, The SeedStack authors <http://seedstack.org>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const express = require('express');
const basicAuth = require('basic-auth');
const app = express();

var authentication = {
    "id": "mock user",
    "type": "user"
};

var authorizations = {
    "id": "mock user",
    "type": "user"
};

var auth = function (req, res, next) {
    function unauthorized(res) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        return res.sendStatus(401);
    }

    var user = basicAuth(req);

    if (!user || !user.name || !user.pass) {
        return unauthorized(res);
    }

    if (user.name === 'foo' && user.pass === 'bar') {
        return next();
    } else {
        return unauthorized(res);
    }
};

app.get('/authentication', auth, (req, res, next) => {
    res.json(authentication);
});

app.get('/authorizations', (req, res, next) => {
    res.json(authorizations);
});

app.delete('/authentication', (req, res, next) => {
    res.sendStatus(204);
});

app.use(express.static(__dirname + '/.'));

app.listen(3000, "0.0.0.0", () => {
    console.log('Hub app listening on port 3000!');
});

