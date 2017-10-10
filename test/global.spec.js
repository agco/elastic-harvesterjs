'use strict';

const harvesterApp = require('./app.js');
const events = require('./events.js');
const config = require('./config.js');

const esLatency = 1000;
const Cache = require('../lib/singletonAdapterCache');

before(function accessMochaThis() {
  const _this = this;
  this.timeout(config.esIndexWaitTime + esLatency);
  return harvesterApp.apply(this).then((harvesterInstance) => {
    _this.singletonCache = Cache.getInstance();
    return events(harvesterInstance);
  });
});

beforeEach(function accessMochaThis() {
  this.singletonCache.clear(); // clear the cache between tests
});
