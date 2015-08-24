var should = require('should');
var request = require('supertest');
var Promise = require('bluebird');
var seeder = require('./seeder.js');

describe('sorting', function () {
    function addLink(parentEndpoint,parentFixtureIndex,childEndpoint,childFixtureIndex){
        var payload = {};

        payload[parentEndpoint] = [
            {
                links: {
                }
            }
        ];
        payload[parentEndpoint][0].links[childEndpoint]=[ids[childEndpoint][childFixtureIndex]];

        return new Promise(function (resolve, reject) {
            request(config.baseUrl)
                .put('/'+parentEndpoint+'/' + ids[parentEndpoint][parentFixtureIndex])
                .send(payload).expect('Content-Type', /json/)
                .expect(200)
                .end(function (error,response) {
                    should.not.exist(error);
                    if (error) {
                        reject(error);
                        return;
                    }
                    var body = JSON.parse(response.text);
                    (body[parentEndpoint][0].links[childEndpoint]).should.containEql(ids[childEndpoint][childFixtureIndex]);
                    return resolve();
                });
        })
    }

    var config, ids;
    before(function () {
        config = this.config;
        this.timeout(config.esIndexWaitTime*2 + 1000);
        return seeder(this.harvesterApp).dropCollectionsAndSeed('pets','people')
            .then(function (result) {
                ids = result;

                return addLink('people', 0, 'pets', 0)
                    .then(function () {
                        return addLink('people', 1, 'pets', 1);
                    })
                    .then(function () {
                        return Promise.delay(config.esIndexWaitTime);
                    });
            });
    });

    describe('nested sorting', function () {

        it('should be possible to do a nested sort, ascending on numeric fields', function (done) {
            request(config.baseUrl).get('/people/search?sort=links.pets.appearances&include=pets&limit=1').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked);
                should.exist(body.linked.pets);
                (body.people[0].name).should.equal("Wally");
                done();
            });
        });

        it('should be possible to do a nested sort, descending on numeric fields', function (done) {
            request(config.baseUrl).get('/people/search?sort=-links.pets.appearances&include=pets&limit=1').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked);
                should.exist(body.linked.pets);
                (body.people[0].name).should.equal("Dilbert");
                done();
            });
        });

        it('should be possible to do a nested sort, ascending on text fields', function (done) {
            request(config.baseUrl).get('/people/search?sort=links.pets.name&include=pets&limit=1').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked);
                should.exist(body.linked.pets);
                (body.people[0].name).should.equal("Dilbert");
                done();
            });
        });

        it('should be possible to do a nested sort, descending on text fields', function (done) {
            request(config.baseUrl).get('/people/search?sort=-links.pets.name&include=pets&limit=1').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked);
                should.exist(body.linked.pets);
                (body.people[0].name).should.equal("Wally");
                done();
            });
        });

        it('should be possible to combine sorting on nested and un-nested fields', function (done) {
            request(config.baseUrl).get('/people/search?sort=appearances,links.pets.name').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                (body.people[0].name).should.equal("Wally");
                done();
            });
        });
    });

    describe('regular sorting', function () {
        it('should be possible to sort ascending on numeric fields', function (done) {
            request(config.baseUrl).get('/people/search?sort=appearances').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                (body.people[0].name).should.equal("Wally");
                done();
            });
        });

        it('should be possible to combine sorting on numeric and text fields', function (done) {
            request(config.baseUrl).get('/people/search?sort=appearances,name').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                (body.people[0].name).should.equal("Wally");
                done();
            });
        });

        it('should be possible to sort descending on numeric fields', function (done) {
            request(config.baseUrl).get('/people/search?sort=-appearances').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                (body.people[0].name).should.equal("Dilbert");
                done();
            });
        });

        it('should be possible to sort ascending on text fields', function (done) {
            request(config.baseUrl).get('/people/search?sort=name').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                (body.people[0].name).should.equal("Dilbert");
                done();
            });
        });

        it('should be possible to sort descending on text fields', function (done) {
            request(config.baseUrl).get('/people/search?sort=-name').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                (body.people[0].name).should.equal("Wally");
                done();
            });
        });
    });

});
