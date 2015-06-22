var inflect = require('i')();
var should = require('should');
var _ = require('lodash');
var request = require('supertest');
var Promise = require('bluebird');
var fixtures = require('./fixtures');
var seeder = require('./seeder.js');


describe('aggregations', function () {

    var config, ids;
    before(function () {
        config = this.config;
        this.timeout(config.esIndexWaitTime + 1000);
        return seeder(this.harvesterApp).dropCollectionsAndSeed(false, 'people', 'pets').then(function (result) {
            ids = result;
        }).then(function () {
                var payload = {};

                payload.people = [
                    {
                        links: {
                            pets: [ids.pets[0]]
                        }
                    }
                ];

                return new Promise(function (resolve, reject) {
                    request(config.baseUrl).put('/people/' + ids.people[0]).send(payload).expect('Content-Type', /json/).expect(200).end(function (error,
                                                                                                                                                   response) {
                        should.not.exist(error);
                        if (error) {
                            reject(error);
                            return;
                        }
                        var body = JSON.parse(response.text);
                        (body.people[0].links.pets).should.containEql(ids.pets[0]);
                        resolve();
                    });
                });
            }).then(function () {
                return Promise.delay(config.esIndexWaitTime);
            });
    });

    describe('terms', function () {
        it('should keep simple backwards compatibility with original terms aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations.fields=name').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.meta.aggregations.name);
                (body.meta.aggregations.name.length).should.equal(fixtures().people.length);
                done();
            });
        });

        it('should be possible to do a level 1 terms aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=name_agg&name_agg.type=terms&name_agg.property=name').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.meta.aggregations.name_agg);
                (body.meta.aggregations.name_agg.length).should.equal(fixtures().people.length);
                var names = {};
                _.each(body.meta.aggregations.name_agg, function (value) {
                    names[value["key"]] = true;
                });
                _.each(fixtures().people, function (person) {
                    should.exist(names[person.name]);
                });
                done();
            });
        });
    });
    describe('top_hits', function () {
        it('should be possible to do a level 1 top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1').expect(200).end(function (err,
                                                                                                                                                                                         res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.meta.aggregations.mostpopular);
                (body.meta.aggregations.mostpopular.length).should.equal(1);
                var max_appearances = 0;
                _.each(fixtures().people, function (person) {
                    person.appearances > max_appearances && (max_appearances = person.appearances);
                });
                (body.meta.aggregations.mostpopular[0].appearances).should.equal(max_appearances);
                done();
            });
        });

        it('should be possible to specify which fields are returned by a level 1 top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.fields=name').expect(200).end(function (err,
                                                                                                                                                                                                                 res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.meta.aggregations.mostpopular);
                (body.meta.aggregations.mostpopular.length).should.equal(1);
                (Object.keys(body.meta.aggregations.mostpopular[0]).length).should.equal(1);

                var max_appearances = 0;
                var max_appearances_name = "";
                _.each(fixtures().people, function (person) {
                    person.appearances > max_appearances && (max_appearances = person.appearances) && (max_appearances_name = person.name);
                });
                (body.meta.aggregations.mostpopular[0].name).should.equal(max_appearances_name);
                done();
            });
        });

        it('should be possible to have linked documents returned by a level 1 top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?limit=10000&aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1000&mostpopular.include=pets').expect(200).end(function (err,
                                                                                                                                                                                                                                 res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked);
                should.exist(body.linked.pets);
                (body.linked.pets.length).should.equal(1);
                (body.linked.pets[0].id).should.equal(ids.pets[0]);
                done();
            });
        });

        it('should be possible to have linked documents returned by a level N top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=n&n.property=name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets').expect(200).end(function (err,
                                                                                                                                                                                                                                                   res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked.pets);
                (body.linked.pets.length).should.equal(1);
                (body.linked.pets[0].id).should.equal(ids.pets[0]);
                done();
            });
        });

        it('should dedupe linked documents returned by both a level N top_hits aggregation & the harvest-provided include', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=n&n.property=name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets&include=pets').expect(200).end(function (err,
                                                                                                                                                                                                                                                                res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked.pets);
                (body.linked.pets.length).should.equal(1);
                done();
            });
        });

        //Skipping for now; this test requires an es_mapping to be provided.
        it.skip('should be possible to have linked documents returned in a nested, then un-nested N level top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=n&n.property=links.pet.name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets').expect(200).end(function (err,
                                                                                                                                                                                                                                                             res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked.pets);
                (body.linked.pets.length).should.equal(1);
                (body.linked.pets[0].id).should.equal(ids.pets[0]);
                done();
            });
        });

        it('should be able to remove linked documents', function (done) {
            request(config.baseUrl).patch('/people/' + ids.people[0]).send([
                    {path: '/people/0/links/pets', op: 'replace', value: []}
                ]).expect('Content-Type', /json/).expect(200).end(function (error, response) {
                    should.not.exist(error);
                    var body = JSON.parse(response.text);
                    should.not.exist(body.people[0].links);
                    done();
                });
        });
    });
});
