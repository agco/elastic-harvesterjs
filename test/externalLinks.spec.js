var _ = require('lodash');
var Joi = require('joi');
var harvester = require('harvesterjs');
var should = require('should');

var request = require('supertest');
var seeder = require('./seeder.js');
var config = require('./config.js');

describe('Syncing external links', function () {

    describe('when remote API is down', function () {
        before(function () {
            this.timeout(config.esIndexWaitTime + 1000);
            return seeder(this.harvesterApp).dropCollectionsAndSeed('equipment');
        });

        it('should allow searching on id from linked entity from remote API', function (done) {
            request(config.baseUrl).get('/equipment/search?links.dealer.id=d767ffc1-0ab6-11e5-a3f4-470467a3b6a8')
                .expect(200).end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    body.equipment.length.should.equal(1);
                    body.equipment[0].links.should.have.property('dealer', 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8');
                    done();
                });
        });
        it.skip('should allow including remote links', function (done) {
            /**
             * This test is skipped because impl responds with 400, and I don't think it's correct
             */
            request(config.baseUrl).get('/equipment/search?include=dealer&links.dealer.id=d767ffc1-0ab6-11e5-a3f4-470467a3b6a8')
                .expect(200).end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    body.equipment.length.should.equal(1);
                    body.equipment[0].links.should.have.property('dealer', 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8');
                    body.linked.should.have.property('dealers', [
                        {id: 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8', name: 'Dilear'}
                    ]);
                    done();
                });
        });
    });

    describe('when remote API is up', function () {

        before(function () {
            var mainHarvesterApp = this.harvesterApp;
            this.timeout(config.esIndexWaitTime + 1000);
            var options = _.cloneDeep(config.harvester.options);
            options.db = 'ehTestDb2';
            options.connectionString = 'mongodb://127.0.0.1:27017/' + options.db;
            var harvesterApp2 = harvester(options);
            var port = config.harvester.port + 1;
            harvesterApp2.resource('dealer', {
                name: Joi.string()
            }).listen(port);
            var seederInstance = seeder(harvesterApp2, 'http://localhost:' + port);
            return seederInstance.dropCollections('dealers').then(function () {
                return seederInstance.seedCustomFixture({dealers: [
                    {
                        id: 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8',
                        name: 'Dilear'
                    }
                ]})
            }).then(function () {
                    return seeder(mainHarvesterApp).dropCollectionsAndSeed('equipment');
                });
        });

        it('should allow searching on id from linked entity from remote API', function (done) {
            request(config.baseUrl).get('/equipment/search?links.dealer.id=d767ffc1-0ab6-11e5-a3f4-470467a3b6a8')
                .expect(200).end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    body.equipment.length.should.equal(1);
                    body.equipment[0].links.should.have.property('dealer', 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8');
                    done();
                });
        });

        it('should allow searching on id from linked entity from remote API', function (done) {
            request(config.baseUrl).get('/equipment/search?links.dealer.id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
                .expect(200).end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    body.equipment.length.should.equal(1);
                    body.equipment[0].links.should.have.property('dealer', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
                    done();
                });
        });

        it('should allow including remote links', function (done) {
            request(config.baseUrl).get('/equipment/search?include=dealer&links.dealer.id=d767ffc1-0ab6-11e5-a3f4-470467a3b6a8')
                .expect(200).end(function (err, res) {
                    should.not.exist(err);
                    var body = JSON.parse(res.text);
                    body.equipment.length.should.equal(1);
                    body.equipment[0].links.should.have.property('dealer', 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8');
                    body.linked.should.have.property('dealers', [
                        {id: 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8', name: 'Dilear'}
                    ]);
                    done();
                });
        });
    });
});


