'use strict';
const _ = require('lodash');
const request = require('supertest');
const Promise = require('bluebird');

const config = require('./config.js');
const fixtures = require('./fixtures');


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
module.exports = (harvesterInstance, baseUrl) => {
  const _baseUrl = baseUrl || `http://localhost:${config.harvester.port}`;

  function post(key, value) {
    return new Promise((resolve, reject) => {
      const body = {};
      body[key] = value;
      request(_baseUrl).post(`/${key}`).send(body).expect('Content-Type', /json/).expect(201).end((error, response) => {
        if (error) {
          reject(error);
          return;
        }
        const resources = JSON.parse(response.text)[key];
        const ids = {};
        ids[key] = [];
        _.forEach(resources, (resource) => {
          ids[key].push(resource.id);
        });
        resolve(ids);
      });
    });
  }

  function drop(collectionName) {
    const dropESDocumentsPromise = new Promise((resolve, reject) => {
      request(`${config.harvester.options.es_url}/${config.harvester.options.es_index}`)
        .del(`/${collectionName}/_query?q=*`)
        .end((error) => {
          error ? reject(error) : resolve();
        });
    });
    const dropMongoCollection = new Promise((resolve) => {
      const collection = harvesterInstance.adapter.db.collections[collectionName];
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
    if (arguments.length === 0) {
      throw new Error('Collection names must be specified explicitly');
    }
    const collectionNames = arguments.length === 0 ? _.keys(fixtures()) : arguments;
    const promises = _.map(collectionNames, (collectionName) => {
      return drop(collectionName);
    });
    return Promise.all(promises).then(() => {
      return collectionNames;
    });
  }

  /**
     * Drops collections from Mongo and ElasticSearch.
     *
     * Requires at least one param with fixture name.
     *
     * By default waits some time (config.esIndexWaitTime) before resolving the promise to allow ElasticSearch index
     * the documents. If you do not want to wait for ES then pass `false` as first param.
     *
     * @returns {*} promise
     */
  function dropCollectionsAndSeed() {
    let delay = true;
    const args = [];
    Array.prototype.push.apply(args, arguments);
    if (arguments.length > 0 && (arguments[0] === true || arguments[0] === false)) {
      delay = arguments[0];
      args.shift();
    }
    return dropCollections.apply(this, args).then((collectionNames) => {
      const allFixtures = fixtures();
      const promises = _.map(collectionNames, (collectionName) => {
        return post(collectionName, allFixtures[collectionName]);
      });
      return Promise.all(promises);
    }).then((result) => {
      const response = {};
      _.forEach(result, (item) => {
        _.extend(response, item);
      });
      if (delay) {
        return Promise.delay(config.esIndexWaitTime).then(() => {
          return response;
        });
      }
      return response;
    });
  }

  function seedCustomFixture(fixture) {
    const promises = _.map(fixture, (items, collectionName) => {
      return post(collectionName, items);
    });
    return Promise.all(promises);
  }

  if (harvesterInstance === null) {
    throw new Error('Harvester instance is required param');
  }

  return {
    dropCollections,
    dropCollectionsAndSeed,
    seedCustomFixture,
    post
  };
};
