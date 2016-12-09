'use strict';

var _ = require('lodash');
var harvesterApp = require('./app.js');
var events = require('./events.js');
var config = require('./config.js');
var Promise = require('bluebird');
var testUtils = require('./util');

var esLatency = 1000;

before(function () {
    this.timeout(config.esIndexWaitTime + 1000);
    return harvesterApp.apply(this).then(function (harvesterInstance) {
        return events(harvesterInstance);
    });

});

beforeEach(function () {
    return Promise.all(_.forEach(config.harvester.options.es_types, function (indexName) {
        return testUtils.deleteAllEsDocsFromIndex(config.harvester.options.es_index, indexName);
    }));
});
