var should = require('should');
var _ = require('lodash');
var Promise = require('bluebird');
var request = require('supertest');

var seeder = require('./seeder.js');

describe('resources', function () {

    var config, ids;
    var collections = ['people', 'pets', 'toys'];
    before(function () {
        config = this.config;
        this.timeout(config.esIndexWaitTime + 1000);
        var seederInstance = seeder(this.harvesterApp);
        return seederInstance.dropCollectionsAndSeed.apply(seederInstance, collections).then(function (result) {
            ids = result;
        });
    });

    describe('getting a list of resources', function () {
        _.each(collections, function (collectionName) {
            it('in collection "' + collectionName + '"', function (done) {
                request(config.baseUrl).get('/' + collectionName).expect('Content-Type', /json/).expect(200).end(function (error, response) {
                    should.not.exist(error);
                    var body = JSON.parse(response.text);
                    ids[collectionName].forEach(function (id) {
                        _.contains(_.pluck(body[collectionName], 'id'), id).should.equal(true);
                    });
                    done();
                });
            });
        });
    });

    describe('getting each individual resource', function () {
        _.each(collections, function (collectionName) {
            it('in collection "' + collectionName + '"', function (done) {
                Promise.all(ids[collectionName].map(function (id) {
                        return new Promise(function (resolve) {
                            request(config.baseUrl).get('/' + collectionName + '/' + id).expect('Content-Type', /json/).expect(200).end(function (error, response) {
                                should.not.exist(error);
                                var body = JSON.parse(response.text);
                                body[collectionName].forEach(function (resource) {
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
