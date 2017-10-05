'use strict';

const should = require('should');
const request = require('supertest');

const seeder = require('./seeder.js');

describe('limits', () => {
  let config;
  before(function accessMochaThis() {
    config = this.config;
    this.timeout(config.esIndexWaitTime + 1000);
    return seeder(this.harvesterApp).dropCollectionsAndSeed('people');
  });

  describe('limits', () => {
    // Todo: maybe this should actually test a random amount<#of resouces.
    it('should be possible to tell how many documents to return', (done) => {
      request(config.baseUrl).get('/people/search?limit=1').expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.people.length).should.equal(1);
        done();
      });
    });
  });
});
