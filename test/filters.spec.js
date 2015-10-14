var inflect = require('i')();
var should = require('should');
var _ = require('lodash');
var request = require('supertest');
var Promise = require('bluebird');

var seeder = require('./seeder.js');

describe("filters", function () {

    var config, ids;
    before(function () {
        config = this.config;
        this.timeout(config.esIndexWaitTime + 1000);
        return seeder(this.harvesterApp).dropCollectionsAndSeed(false, 'people', 'pets').then(function (result) {
            ids = result;
            return new Promise(function (resolve) {
                var payload = {};

                payload.people = [
                    {
                        links: {
                            pets: [ids.pets[0]]
                        }
                    }
                ];

                request(config.baseUrl).put('/people/' + ids.people[0]).send(payload).expect('Content-Type', /json/).expect(200).end(function (error,
                                                                                                                                               response) {
                    should.not.exist(error);
                    var body = JSON.parse(response.text);
                    (body.people[0].links.pets).should.containEql(ids.pets[0]);
                    resolve();
                });
            }).then(function () {
                    return Promise.delay(config.esIndexWaitTime);
                });
        });
    });

    it("should allow top-level resource filtering for search route", function (done) {
        request(config.baseUrl).get('/people/search?name=Dilbert').expect('Content-Type', /json/).expect(200).end(function (error, response) {
            should.not.exist(error);
            var body = JSON.parse(response.text);
            body.people.length.should.equal(1);
            done();
        });
    });

    it("should allow top-level resource filtering based on a numeric value", function (done) {
        request(config.baseUrl).get('/people/search?appearances=1934').expect('Content-Type', /json/).expect(200).end(function (error, response) {
            should.not.exist(error);
            var body = JSON.parse(response.text);
            body.people.length.should.equal(1);
            done();
        });
    });
    it("should allow combining top-level resource filtering for search route based on string & numeric values", function (done) {
        request(config.baseUrl).get('/people/search?name=Dilbert&appearances=3457').expect('Content-Type', /json/).expect(200).end(function (error, response) {
            should.not.exist(error);
            var body = JSON.parse(response.text);
            body.people.length.should.equal(1);
            done();
        });
    });

    it("should allow resource sub-document filtering", function (done) {
        //add mapping & do nesting to enable this.
        request(config.baseUrl).get("/people/search?links.pets.name=Dogbert").end(function (err, response) {
            should.not.exist(err);
            var body = JSON.parse(response.text);
            body.people.length.should.equal(1);
            done();
        });
    });

    it("should allow resource sub-document filtering combined with subdocument range queries", function (done) {
        //add mapping & do nesting to enable this.
        request(config.baseUrl).get("/people/search?links.pets.name=Dogbert&links.pets.appearances=lt=1935").end(function (err, response) {
            should.not.exist(err);
            var body = JSON.parse(response.text);
            body.people.length.should.equal(1);
            done();
        });
    });

    it('should support lt query', function (done) {
        request(config.baseUrl).get('/people/search?appearances=lt=1935').expect(200).end(function (err, res) {
            should.not.exist(err);
            var body = JSON.parse(res.text);
            (body.people.length).should.equal(1);
            (body.people[0].name).should.equal('Wally');
            done();
        });
    });
    it('should support le query', function (done) {
        request(config.baseUrl).get('/people/search?appearances=le=1934').expect(200).end(function (err, res) {
            should.not.exist(err);
            var body = JSON.parse(res.text);
            (body.people.length).should.equal(1);
            (body.people[0].name).should.equal('Wally');
            done();
        });
    });
    it('should support gt query', function (done) {
        request(config.baseUrl).get('/people/search?appearances=gt=1935').expect(200).end(function (err, res) {
            should.not.exist(err);
            var body = JSON.parse(res.text);
            (body.people.length).should.equal(1);
            (body.people[0].name).should.equal('Dilbert');
            done();
        });
    });
    it('should support ge query', function (done) {
        request(config.baseUrl).get('/people/search?appearances=ge=3457').expect(200).end(function (err, res) {
            should.not.exist(err);
            var body = JSON.parse(res.text);
            (body.people.length).should.equal(1);
            (body.people[0].name).should.equal('Dilbert');
            done();
        });
    });
    it('should support multiple range queries on the same property', function (done) {
        request(config.baseUrl).get('/people/search?appearances=ge=3457&appearances=lt=3500').expect(200).end(function (err, res) {
            should.not.exist(err);
            var body = JSON.parse(res.text);
            (body.people.length).should.equal(1);
            (body.people[0].name).should.equal('Dilbert');
            done();
        });
    });

    it('should support multiple range queries on the same nested property', function (done) {
        request(config.baseUrl).get('/people/search?links.pets.appearances=lt=1904&links.pets.appearances=ge=1903').expect(200).end(function (err, res) {
            should.not.exist(err);
            var body = JSON.parse(res.text);
            (body.people.length).should.equal(1);
            (body.people[0].name).should.equal('Dilbert');
            done();
        });
    });

    it('should support multiple range queries on the same nested property', function (done) {
        request(config.baseUrl).get('/people/search?links.pets.appearances=lt=1903&links.pets.appearances=ge=1903').expect(200).end(function (err, res) {
            should.not.exist(err);
            var body = JSON.parse(res.text);
            (body.people.length).should.equal(0);
            done();
        });
    });

    it('should support wildcard queries', function (done) {
        request(config.baseUrl).get('/people/search?name=D*').expect(200).end(function (err, res) {
            should.not.exist(err);
            var body = JSON.parse(res.text);
            (body.people.length).should.equal(1);
            (body.people[0].name).should.equal('Dilbert');
            done();
        });
    });

    it('should support multi-value queries', function (done) {
        //NOTE: these ids will fail a basic match query lookup, while most other id values will not;
        //they are specially selected and should be retained in any version of this test.
        request(config.baseUrl).get('/people/search?id=b76826d0-0ab6-11e5-a3f4-470467a3b6a8,b767ffc1-0ab6-11e5-a3f4-470467a3b6a8').expect(200).end(function (err,
                                                                                                                                                             res) {
            should.not.exist(err);
            var body = JSON.parse(res.text);
            (body.people.length).should.equal(2);
            done();
        });
    });

    it('should support multi-value queries on numeric fields', function (done) {
        request(config.baseUrl).get('/people/search?appearances=1934,3457').expect(200).end(function (err, res) {
            should.not.exist(err);
            var body = JSON.parse(res.text);
            (body.people.length).should.equal(2);
            done();
        });
    });
});
