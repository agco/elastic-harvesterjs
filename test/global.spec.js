#!/usr/bin/env node
'use strict';

var options = require('./config').options;

before(function (done) {
    this.app = require('./index')(options)
        .catch(function (error) {
            done(error);
            process.exit(1);
        });
    done();
});
after(function (done) {
    this.app
        .then(function (harvesterApp) {
            harvesterApp.router.close();
            this.app = null;
        })
        .finally(function () {
            done();
        });
});
