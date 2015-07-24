var MappingMaker = require("../non-functionals/mappingMaker");
var should = require('should');
var mappingMaker = new MappingMaker();

var seeder = require('./seeder.js');

describe('mappingMaker', function () {

    var config;
    before(function () {
        config = this.config;
        this.timeout(config.esIndexWaitTime + 1000);
        return seeder(this.harvesterApp).dropCollectionsAndSeed('people');
    });

    it('should be able to scaffold a mapping for a harvest app', function () {

        return mappingMaker.generateMapping(this.harvesterApp, "people", "generated.test-created.mapping.json").then(function (mapping) {
            console.log('Generated Mapping:');
            console.log(JSON.stringify(mapping));
        });
    });
});
