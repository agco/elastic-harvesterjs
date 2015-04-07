var MappingMaker = require("../../non-functionals/mappingMaker");
var AutoUpdateInputGenerator = require("../../autoUpdateInputGenerator");
var inflect= require('i')();
var should = require('should');
var _ = require('lodash');
var mappingMaker  = new MappingMaker();
var autoUpdateInputGenerator  = new AutoUpdateInputGenerator();

module.exports = function() {

    describe('mappingMaker', function () {
        it('should be able to scaffold a mapping for a harvest app', function (done) {

            return mappingMaker.generateMapping(__dirname+"/../app","people","generated.test-created.mapping.json")
                .then(function(mapping){
                    console.log('Generated Mapping:');
                    console.log(JSON.stringify(mapping));
                    done();
                });
        });
    });

    describe('autoUpdateInputGenerator', function () {
        it('should be able to scaffold the input for autoUpdates of a harvestApp\'s schema', function (done) {

            return autoUpdateInputGenerator.generateInput(__dirname+"/../app","people","generated.test-created.input.json")
                .then(function(mapping){
                    console.log('Generated Mapping:');
                    console.log(JSON.stringify(mapping));
                    done();
                });
        });
    });
};