'use strict';

const MappingMaker = require('../non-functionals/mappingMaker');
const mappingMaker = new MappingMaker();

const seeder = require('./seeder.js');

describe('mappingMaker', () => {
  let config;
  before(function accessMochaThis() {
    config = this.config;
    this.timeout(config.esIndexWaitTime + 1000);
    return seeder(this.harvesterApp).dropCollectionsAndSeed('people');
  });

  it('should be able to scaffold a mapping for a harvest app', function accessMochaThis() {
    return mappingMaker.generateMapping(this.harvesterApp, 'people', 'generated.test-created.mapping.json')
      .then((mapping) => {
        console.log('Generated Mapping:');
        console.log(JSON.stringify(mapping));
      });
  });
});
