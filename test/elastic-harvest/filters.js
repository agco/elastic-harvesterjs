var inflect= require('i')();
var should = require('should');
var _ = require('lodash');
var RSVP = require('rsvp');
var request = require('supertest');
var Promise = RSVP.Promise;

module.exports = function(baseUrl,keys,ids) {

    describe("filters", function() {
        it("should allow top-level resource filtering for search route", function (done) {
            request(baseUrl).get('/people/search?name=dilbert')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (error, response) {
                    should.not.exist(error);
                    var body = JSON.parse(response.text);
                    body.people.length.should.equal(1);
                    done();
                });
        });

        it("should allow top-level resource filtering based on a numeric value", function (done) {
            request(baseUrl).get('/people/search?appearances=1934')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (error, response) {
                    should.not.exist(error);
                    var body = JSON.parse(response.text);
                    body.people.length.should.equal(1);
                    done();
                });
        });
        it("should allow combining top-level resource filtering for search route based on string & numeric values", function (done) {
            request(baseUrl).get('/people/search?name=dilbert&appearances=3457')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (error, response) {
                    should.not.exist(error);
                    var body = JSON.parse(response.text);
                    body.people.length.should.equal(1);
                    done();
                });
        });
        it.skip("should allow resource sub-document filtering", function (done) {
            //add mapping & do nesting to enable this.
            request(baseUrl).get("/people/search?links.pets.name=dogbert")
                .end(function (err, response) {
                    should.not.exist(error);
                    var body = JSON.parse(response.text);
                    body.people.length.should.equal(1);
                    done();
                });
        });
        it('should support lt query', function (done) {
            request(baseUrl).get('/people/search?appearances=lt=1935')
                .expect(200)
                .end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    (body.people.length).should.equal(1);
                    (body.people[0].name).should.equal('Wally');
                    done();
                });
        });
        it('should support le query', function (done) {
            request(baseUrl).get('/people/search?appearances=le=1934')
                .expect(200)
                .end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    (body.people.length).should.equal(1);
                    (body.people[0].name).should.equal('Wally');
                    done();
                });
        });
        it('should support gt query', function (done) {
            request(baseUrl).get('/people/search?appearances=gt=1935')
                .expect(200)
                .end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    (body.people.length).should.equal(1);
                    (body.people[0].name).should.equal('Dilbert');
                    done();
                });
        });
        it('should support ge query', function (done) {
            request(baseUrl).get('/people/search?appearances=ge=3457')
                .expect(200)
                .end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    (body.people.length).should.equal(1);
                    (body.people[0].name).should.equal('Dilbert');
                    done();
                });
        });

        it('should support wildcard queries', function (done) {
            request(baseUrl).get('/people/search?name=d*')
                .expect(200)
                .end(function (err, res) {
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
            request(baseUrl).get('/people/search?id=547e53616773240200a89566,547e53616773240200a89531')
                .expect(200)
                .end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    (body.people.length).should.equal(2);
                    done();
                });
        });


    });
};