var _ = require('lodash');
var inflect = require('i')();
var request = require('supertest');
var Promise = require('bluebird');

var config = require('./config.js');
var fixtures = require('./fixtures');


/**
 * Configure seeding service.
 *
 * Sample usage:
 *
 * seed().seed('pets','people').then(function(ids){});
 * seed(harvesterInstance,'http://localhost:8001').seed('pets','people').then(function(ids){});
 *
 * @param harvesterInstance harvester instance that will be used to access database
 * @param baseUrl optional harvester's base url to post fixtures to
 * @returns {{dropCollectionsAndSeed: Function}} configured seeding service
 */
module.exports = function (harvesterInstance, baseUrl) {

    baseUrl = baseUrl || 'http://localhost:' + config.harvester.port;

    function post(key, value) {
        return new Promise(function (resolve, reject) {
            var body = {};
            body[key] = value;
            request(baseUrl).post('/' + key).send(body).expect('Content-Type', /json/).expect(201).end(function (error, response) {
                if (error) {
                    reject(error);
                    return;
                }
                var resources = JSON.parse(response.text)[key];
                var ids = {};
                ids[key] = [];
                _.forEach(resources, function (resource) {
                    ids[key].push(resource.id);
                });
                resolve(ids);
            });
        });
    }

    function drop(collectionName) {
        var dropESDocumentsPromise = new Promise(function (resolve, reject) {
            request(config.harvester.options.es_url + '/' + config.harvester.options.es_index).del('/' + collectionName + '/_query?q=*').end(function (error) {
                error ? reject(error) : resolve();
            });
        });
        var dropMongoCollection = new Promise(function (resolve) {
            var collection = harvesterInstance.adapter.db.collections[collectionName];
            if (collection) {
                collection.drop(resolve);
            } else {
                resolve();
            }
        });
        return Promise.all([dropESDocumentsPromise, dropMongoCollection]);
    }

    /**
     * Drop collections whose names are specified in vararg manner.
     *
     * @returns {*} array of collection names
     */
    function dropCollections() {
        if (0 === arguments.length) {
            throw new Error('Collection names must be specified explicitly');
        }
        var collectionNames = 0 === arguments.length ? _.keys(fixtures()) : arguments;
        var promises = _.map(collectionNames, function (collectionName) {
            return drop(collectionName);
        });
        return Promise.all(promises).then(function () {
            return collectionNames;
        });
    }

    /**
     * Drops collections from Mongo and ElasticSearch.
     *
     * Requires at least one param with fixture name.
     *
     * By default waits some time (config.esIndexWaitTime) before resolving the promise to allow ElasticSearch index the documents.
     * If you do not want to wait for ES then pass `false` as first param.
     *
     * @returns {*} promise
     */
    function dropCollectionsAndSeed() {
        var delay = true;
        var args = [];
        Array.prototype.push.apply(args, arguments);
        if (0 < arguments.length && (true === arguments[0] || false === arguments[0])) {
            delay = arguments[0];
            args.shift();
        }
        return dropCollections.apply(this, args).then(function (collectionNames) {
            var allFixtures = fixtures();
            var promises = _.map(collectionNames, function (collectionName) {
                return post(collectionName, allFixtures[collectionName]);
            });
            return Promise.all(promises)
        }).then(function (result) {
                var response = {};
                _.forEach(result, function (item) {
                    _.extend(response, item);
                });
                if (delay) {
                    return Promise.delay(config.esIndexWaitTime).then(function () {
                        return response;
                    });
                } else {
                    return response;
                }
            });
    }

    function seedCustomFixture(fixture) {
        var promises = _.map(fixture, function (items, collectionName) {
            return post(collectionName, items);
        });
        return Promise.all(promises)
    }

    if (null == harvesterInstance) {
        throw new Error('Harvester instance is required param');
    }

    return {
        dropCollections: dropCollections,
        dropCollectionsAndSeed: dropCollectionsAndSeed,
        seedCustomFixture: seedCustomFixture
    }
};
