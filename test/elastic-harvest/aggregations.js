var inflect= require('i')();
var should = require('should');
var _ = require('lodash');
var RSVP = require('rsvp');
var request = require('supertest');
var Promise = RSVP.Promise;
var fixtures = require('./../fixtures.json');


module.exports = function(baseUrl,keys,ids,ES_INDEX_WAIT_TIME) {

    describe('aggregations', function () {
        describe('terms', function () {
            it('should keep simple backwards compatibility with original terms aggregation', function (done) {
                request(baseUrl)
                    .get('/' + keys.person + '/search?aggregations.fields=name')
                    .expect(200)
                    .end(function (err, res) {
                        should.not.exist(err);
                        var body = JSON.parse(res.text);
                        should.exist(body.meta.aggregations.name);
                        (body.meta.aggregations.name.length).should.equal(fixtures.person.length);
                        done();
                    });
            });

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
                            should.exist(names[person.name]);
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

            it('should be able to add linked documents', function (done) {
                new Promise(function (resolve) {
                    var payload = {};

                    payload[keys.person] = [
                        {
                            links: {
                                pets: [ids[keys.pet][0]]
                            }
                        }
                    ];

                    request(baseUrl)
                        .put('/' + keys.person + '/' + ids[keys.person][0])
                        .send(payload)
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (error, response) {
                            should.not.exist(error);
                            var body = JSON.parse(response.text);
                            (body[keys.person][0].links.pets).should.containEql(ids[keys.pet][0]);
                            setTimeout(function(){
                                resolve(done());
                            },ES_INDEX_WAIT_TIME)
                        });
                })
            });

            it('should be possible to have linked documents returned by a level 1 top_hits aggregation', function (done) {
                request(baseUrl)
                    .get('/' + keys.person + '/search?limit=10000&aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1000&mostpopular.include=pets')
                    .expect(200)
                    .end(function (err, res) {
                        should.not.exist(err);
                        var body = JSON.parse(res.text);
                        should.exist(body.linked[keys.pet]);
                        (body.linked[keys.pet].length).should.equal(1);
                        (body.linked[keys.pet][0].id).should.equal(ids[keys.pet][0]);
                        done();
                    });
            });

            it('should be possible to have linked documents returned by a level N top_hits aggregation', function (done) {
                request(baseUrl)
                    .get('/' + keys.person + '/search?aggregations=n&n.property=name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets')
                    .expect(200)
                    .end(function (err, res) {
                        should.not.exist(err);
                        var body = JSON.parse(res.text);
                        should.exist(body.linked[keys.pet]);
                        (body.linked[keys.pet].length).should.equal(1);
                        (body.linked[keys.pet][0].id).should.equal(ids[keys.pet][0]);
                        done();
                    });
            });

            it('should dedupe linked documents returned by both a level N top_hits aggregation & the harvest-provided include', function (done) {
                request(baseUrl)
                    .get('/' + keys.person + '/search?aggregations=n&n.property=name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets&include=pets')
                    .expect(200)
                    .end(function (err, res) {
                        should.not.exist(err);
                        var body = JSON.parse(res.text);
                        should.exist(body.linked[keys.pet]);
                        (body.linked[keys.pet].length).should.equal(1);
                        done();
                    });
            });

            //Skipping for now; this test requires an es_mapping to be provided.
            it.skip('should be possible to have linked documents returned in a nested, then un-nested N level top_hits aggregation', function (done) {
                request(baseUrl)
                    .get('/' + keys.person + '/search?aggregations=n&n.property=links.pet.name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets')
                    .expect(200)
                    .end(function (err, res) {
                        should.not.exist(err);
                        var body = JSON.parse(res.text);
                        should.exist(body.linked[keys.pet]);
                        (body.linked[keys.pet].length).should.equal(1);
                        (body.linked[keys.pet][0].id).should.equal(ids[keys.pet][0]);
                        done();
                    });
            });

            it('should be able to remove linked documents', function (done) {
                new Promise(function (resolve) {
                    request(baseUrl)
                        .patch('/' + keys.person + '/' + ids[keys.person][0])
                        .send([
                            {path: '/' + keys.person + '/0/links/pets', op: 'replace', value: []}
                        ])
                        .expect('Content-Type', /json/)
                        .expect(200)
                        .end(function (error, response) {
                            should.not.exist(error);
                            var body = JSON.parse(response.text);
                            should.not.exist(body[keys.person][0].links);
                            resolve(done());
                        });
                })
            });
        });
    });
}