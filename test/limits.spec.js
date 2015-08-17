var should = require('should');
var request = require('supertest');

var seeder = require('./seeder.js');

describe('limits', function () {

    var config;
    before(function () {
        config = this.config;
        this.timeout(config.esIndexWaitTime + 1000);
        return seeder(this.harvesterApp).dropCollectionsAndSeed('people');
    });

    describe('limits', function () {
        //Todo: maybe this should actually test a random amount<#of resouces.
        it('should be possible to tell how many documents to return', function (done) {
            request(config.baseUrl).get('/people/search?limit=1').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                (body.people.length).should.equal(1);
                done();
            });
        });
    });
});
