'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');

function fixturesSync() {
  const fixtureList = fs.readdirSync(path.join(__dirname, './')).filter((item) => {
    return item !== 'index.js';
  });
  let fixtures;

  if (!fixtures) {
    fixtures = {};
    _.forEach(fixtureList, (value) => {
      fixtures[path.basename(value, '.js')] = require(`./${value}`);
    });
  }
  return fixtures;
}

const standardFixture = fixturesSync();

module.exports = () => {
  return _.cloneDeep(standardFixture);
};
