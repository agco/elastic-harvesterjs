'use strict';

var harvesterApp = require('./app.js');
var events = require('./events.js');
var config = require('./config.js');

before(function () {
    this.timeout(config.esIndexWaitTime + 1000);
    return harvesterApp.apply(this).then(function (harvesterInstance) {
        return events(harvesterInstance);
    });
});
