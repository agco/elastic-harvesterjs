var should = require('should');
var _ = require('lodash');
var request = require('supertest');
var Promise = require('bluebird');
var seeder = require('./seeder.js');

describe("includes", function () {
    var config, ids;

    before(function () {
        config = this.config;
    });

    function linkToysWithPets() {
        var payload = {};

        payload.pets = [
            {
                links: {
                    toys: [ids.toys[0]]
                }
            }
        ];

        return request(config.baseUrl).put('/pets/' + ids.pets[0]).send(payload).expect('Content-Type', /json/).expect(200);
    }

    function linkPeopleWithPets() {
        var payload = {};

        payload.people = [
            {
                links: {
                    pets: [ids.pets[0]]
                }
            }
        ];

        return request(config.baseUrl).put('/people/' + ids.people[0]).send(payload).expect('Content-Type', /json/).expect(200);
    }

    describe('should be able to add linked documents', function () {

        before(function () {
            this.timeout(config.esIndexWaitTime + 1000);
            return seeder(this.harvesterApp).dropCollectionsAndSeed('people', 'pets', 'toys').then(function (result) {
                ids = result;
            });
        });
        it('i.e. toys to pets', function (done) {
            linkToysWithPets().end(function (error, response) {
                should.not.exist(error);
                var body = JSON.parse(response.text);
                (body.pets[0].links.toys).should.containEql(ids.toys[0]);
                done();
            });
        });

        it('i.e. pets to people', function (done) {
            linkPeopleWithPets().end(function (error, response) {
                should.not.exist(error);
                var body = JSON.parse(response.text);
                (body.people[0].links.pets).should.containEql(ids.pets[0]);
                done();
            });
        });
    });

    describe('when documents are linked', function () {
        before(function () {
            this.timeout(config.esIndexWaitTime + 1000);
            return seeder(this.harvesterApp).dropCollectionsAndSeed(false, 'people', 'pets', 'toys').then(function (result) {
                ids = result;
                var peopleAndPetsPromise = new Promise(function (resolve, reject) {
                    linkPeopleWithPets().end(function (err) {
                        err ? reject(err) : resolve();
                    });
                });
                var toysAndPetsPromise = new Promise(function (resolve, reject) {
                    linkToysWithPets().end(function (err) {
                        err ? reject(err) : resolve();
                    });
                });
                return Promise.all([peopleAndPetsPromise, toysAndPetsPromise]).then(function () {
                    return Promise.delay(config.esIndexWaitTime);
                });
            });
        });

        it('should include linked resources when requested', function (done) {
            request(config.baseUrl).get('/people/search?include=pets').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                (body.linked).should.be.an.Object;
                (body.linked.pets).should.be.an.Array;
                (body.linked.pets.length).should.be.above(0);
                done();
            });
        });

        it('should have links appended to results', function (done) {
            request(config.baseUrl).get('/people/search').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.links);
                should.exist(body.links["people.pets"]);
                should.exist(body.links["people.soulmate"]);
                should.exist(body.links["people.lovers"]);
                done();
            });
        });

        it('should add links for linked entities to links appended to results', function (done) {
            request(config.baseUrl).get('/people/search?include=pets').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.links);
                should.exist(body.links["pets.toys"]);
                done();
            });
        });
    });
});
