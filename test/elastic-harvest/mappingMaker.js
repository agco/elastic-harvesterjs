var MappingMaker = require("../../non-functionals/mappingMaker");
var inflect= require('i')();
var should = require('should');
var _ = require('lodash');
var mappingMaker  = new MappingMaker();

module.exports = function() {

    describe.only('mappingMaker', function () {
        it('should be able to scaffold a mapping for a harvest app', function (done) {

            return mappingMaker.generateMapping("./test/app","people","generated.test-created.mapping.json")
                .then(function(mapping){
                    console.log('Generated Mapping:');
                    console.log(JSON.stringify(mapping));
                    done();
                });
        });
    });
};