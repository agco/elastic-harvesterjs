var inflect= require('i')();
var should = require('should');
var _ = require('lodash');
var RSVP = require('rsvp');
var request = require('supertest');
var Promise = RSVP.Promise;
var fixtures = require('./../fixtures.json');


module.exports = function(baseUrl,keys,ids) {

    describe('aggregations', function () {
        describe('terms', function () {
            it('should be possible to do a level 1 terms aggregation', function (done) {
                request(baseUrl)
                    .get('/' + keys.person + '/search?aggregations=name_agg&name_agg.type=terms&name_agg.property=name')
                    .expect(200)
                    .end(function (err, res) {
                        should.not.exist(err);
                        var body = JSON.parse(res.text);
                        should.exist(body.meta.aggregations.name_agg);
                        (body.meta.aggregations.name_agg.length).should.equal(fixtures.person.length);
                        var names = {};
                        _.each(body.meta.aggregations.name_agg,function(value){
                            names[value["key"]]=true;
                        });
                        _.each(fixtures.person,function(person){
                            should.exist(names[person.name.toLowerCase()]);
                        });
                        done();
                    });
            });
        });
        describe('top_hits', function () {
            it('should be possible to do a level 1 top_hits aggregation', function (done) {
                request(baseUrl)
                    .get('/' + keys.person + '/search?aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1')
                    .expect(200)
                    .end(function (err, res) {
                        should.not.exist(err);
                        var body = JSON.parse(res.text);
                        should.exist(body.meta.aggregations.mostpopular);
                        (body.meta.aggregations.mostpopular.length).should.equal(1);
                        var max_appearances = 0;
                        _.each(fixtures.person,function(person){
                            person.appearances>max_appearances && (max_appearances=person.appearances);
                        });
                        (body.meta.aggregations.mostpopular[0].appearances).should.equal(max_appearances);
                        done();
                    });
            });

            it('should be possible to specify which fields are returned by a level 1 top_hits aggregation', function (done) {
                request(baseUrl)
                    .get('/' + keys.person + '/search?aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.fields=name')
                    .expect(200)
                    .end(function (err, res) {
                        should.not.exist(err);
                        var body = JSON.parse(res.text);
                        should.exist(body.meta.aggregations.mostpopular);
                        (body.meta.aggregations.mostpopular.length).should.equal(1);
                        (Object.keys(body.meta.aggregations.mostpopular[0]).length).should.equal(1);

                        var max_appearances = 0;
                        var max_appearances_name = "";
                        _.each(fixtures.person,function(person){
                            person.appearances>max_appearances && (max_appearances=person.appearances) && (max_appearances_name=person.name);
                        });
                        (body.meta.aggregations.mostpopular[0].name).should.equal(max_appearances_name);
                        done();
                    });
            });
        });
    });
}