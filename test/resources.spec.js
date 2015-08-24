var should = require('should');
var _ = require('lodash');
var Promise = require('bluebird');
var request = require('supertest');
var fixtures = require('./fixtures');

var seeder = require('./seeder.js');

describe('resources', function () {

    var config, ids;
    before(function () {
        config = this.config;
        this.timeout(config.esIndexWaitTime + 1000);
        return seeder(this.harvesterApp).dropCollectionsAndSeed('people', 'pets', 'toys').then(function (result) {
            ids = result;
        });
    });

    describe('getting a list of resources', function () {
        _.each(fixtures(), function (resources, collection) {
            it('in collection "' + collection + '"', function (done) {
                request(config.baseUrl).get('/' + collection).expect('Content-Type', /json/).expect(200).end(function (error, response) {
                    should.not.exist(error);
                    var body = JSON.parse(response.text);
                    ids[collection].forEach(function (id) {
                        _.contains(_.pluck(body[collection], 'id'), id).should.equal(true);
                    });
                    done();
                });
            });
        });
    });

    describe('getting each individual resource', function () {
        _.each(fixtures(), function (resources, collection) {

            it('in collection "' + collection + '"', function (done) {
                Promise.all(ids[collection].map(function (id) {
                        return new Promise(function (resolve) {
                            request(config.baseUrl).get('/' + collection + '/' + id).expect('Content-Type', /json/).expect(200).end(function (error, response) {
                                should.not.exist(error);
                                var body = JSON.parse(response.text);
                                body[collection].forEach(function (resource) {
                                    (resource.id).should.equal(id);
                                });
                                resolve();
                            });
                        });
                    })).then(function () {
                        done();
                    });
            });
        });
    });
});
