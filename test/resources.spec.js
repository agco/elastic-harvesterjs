'use strict';

const should = require('should');
const _ = require('lodash');
const Promise = require('bluebird');
const request = require('supertest');

const seeder = require('./seeder.js');

describe('resources', () => {
  let config;
  let ids;
  const collections = ['people', 'pets', 'toys'];
  before(function accessMochaThis() {
    config = this.config;
    this.timeout(config.esIndexWaitTime + 1000);
    const seederInstance = seeder(this.harvesterApp);
    return seederInstance.dropCollectionsAndSeed.apply(seederInstance, collections).then((result) => {
      ids = result;
    });
  });

  describe('getting a list of resources', () => {
    _.each(collections, (collectionName) => {
      it(`in collection "${collectionName}"`, (done) => {
        request(config.baseUrl)
          .get(`/${collectionName}`).expect('Content-Type', /json/).expect(200).end((error, response) => {
            should.not.exist(error);
            const body = JSON.parse(response.text);
            ids[collectionName].forEach((id) => {
              _.contains(_.pluck(body[collectionName], 'id'), id).should.equal(true);
            });
            done();
          });
      });
    });
  });

  describe('getting each individual resource', () => {
    _.each(collections, (collectionName) => {
      it(`in collection "${collectionName}"`, (done) => {
        Promise.all(ids[collectionName].map((id) => {
          return new Promise((resolve) => {
            request(config.baseUrl)
              .get(`/${collectionName}/${id}`).expect('Content-Type', /json/).expect(200).end((error, response) => {
                should.not.exist(error);
                const body = JSON.parse(response.text);
                body[collectionName].forEach((resource) => {
                  (resource.id).should.equal(id);
                });
                resolve();
              });
          });
        }))
          .then(() => {
            done();
          });
      });
    });
  });
});
