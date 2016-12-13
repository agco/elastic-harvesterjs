'use strict';

var harvesterApp = require('./app.js');
var events = require('./events.js');
var config = require('./config.js');

var esLatency = 1000;
var Cache = require('../lib/singletonAdapterCache');

before(function () {
    var _this = this;
    this.timeout(config.esIndexWaitTime + 1000);
    return harvesterApp.apply(this).then(function (harvesterInstance) {
        _this.singletonCache = Cache.getInstance();
        return events(harvesterInstance);
    });
});

beforeEach(function () {
    this.singletonCache.clear();  // clear the cache between tests
});
