var should = require('should');
var _ = require('lodash');
var RSVP = require('rsvp');
var request = require('supertest');
var Promise = RSVP.Promise;

module.exports = function(baseUrl,keys,ids,ES_INDEX_WAIT_TIME) {

    describe("includes", function(){
        it('should be able to add linked documents', function (done) {
            new Promise(function (resolve) {
                var payload = {};

                payload[keys.pet] = [
                    {
                        links: {
                            toys: [ids[keys.toy][0]]
                        }
                    }
                ];

                request(baseUrl)
                    .put('/' + keys.pet + '/' + ids[keys.pet][0])
                    .send(payload)
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (error, response) {
                        should.not.exist(error);
                        var body = JSON.parse(response.text);
                        (body[keys.pet][0].links.toys).should.containEql(ids[keys.toy][0]);
                        setTimeout(function(){
                            resolve(done());
                        },ES_INDEX_WAIT_TIME)
                    });
            })
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


        it('should include linked resources when requested', function(done) {
            request(baseUrl).get('/people/search?include=pets')
                .expect(200)
                .end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    (body.linked).should.be.an.Object;
                    (body.linked.pets).should.be.an.Array;
                    (body.linked.pets.length).should.be.above(0);
                    done();
                });
        });

        it('should have links appended to results', function(done) {
            request(baseUrl).get('/people/search')
                .expect(200)
                .end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    should.exist(body.links);
                    should.exist(body.links["people.pets"]);
                    should.exist(body.links["people.soulmate"]);
                    should.exist(body.links["people.lovers"]);
                    done();
                });
        });

        it('should add links for linked entities to links appended to results', function(done) {
            request(baseUrl).get('/people/search?include=pets')
                .expect(200)
                .end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    should.exist(body.links);
                    should.exist(body.links["pets.toys"]);
                    done();
                });
        });
    });
};
