var mapmaker = require("../../non-functionals/mapmaker");
var inflect= require('i')();
var should = require('should');
var _ = require('lodash');

module.exports = function(harvest_app,pov) {

    describe('mapmaker', function () {
        it('should be able to scaffold a mapping for a harvest app', function (done) {
            var mapping  = mapmaker.createMapping(harvest_app,pov);
            console.log(mapping);
            done();
        });
    });
};