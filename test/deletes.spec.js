'use strict';

const should = require('should');
const _ = require('lodash');
const $http = require('http-as-promised');
const Promise = require('bluebird');
const addLink = require('./util').addLink;
const fixtures = require('./fixtures');
const seeder = require('./seeder.js');

let config;
let ids;

function giveDilbertAPet() {
  const ratbertsId = ids.pets[0];
  const dilbertsId = ids.people[0];
  const dilbertsPetsLinkage = { pets: [ratbertsId] };

  return addLink('people', dilbertsPetsLinkage, config.baseUrl, `/people/${dilbertsId}`);
}
function giveDilbertASoulmate() {
  const wallysId = ids.people[1];
  const dilbertsId = ids.people[0];
  const dilbertsSoulmateLinkage = { soulmate: wallysId };
  return addLink('people', dilbertsSoulmateLinkage, config.baseUrl, `/people/${dilbertsId}`);
}

function killRatbert() {
  const ratbertsId = ids.pets[0];
  return $http.del(`${config.baseUrl}/pets/${ratbertsId}`, { json: {} });
}

function reviveRatbert() {
  const ratbertsFixture = fixtures().pets[0];
  return $http.post({ url: `${config.baseUrl}/pets/`, json: { pets: [ratbertsFixture] } }).then((resp) => {
    const body = resp[1];
    ids.pets[0] = body.pets[0].id;
  });
}

function killDilbert() {
  const dilbertsId = ids.people[0];
  return $http.del(`${config.baseUrl}/people/${dilbertsId}`, { json: {} });
}

function reviveDilbert() {
  const dilbertsFixture = fixtures().people[0];
  return $http.post({ url: `${config.baseUrl}/people/`, json: { people: [dilbertsFixture] } }).then((resp) => {
    const body = resp[1];
    ids.people[0] = body.people[0].id;
  });
}

// These tests no longer work when custom routing is enabled and ElasticSearch is version 2.x or greater
describe.skip('deletes', () => {
  before(function accessMochaThis() {
    config = this.config;
    this.timeout(config.esIndexWaitTime + 1000);
    return seeder(this.harvesterApp).dropCollectionsAndSeed('people', 'pets', 'toys').then((result) => {
      ids = result;
    });
  });

  it('Should correctly sync non-primary resource deletes', function accessMochaThis() {
    this.timeout(5000);
    const id = ids.people[0];
    return Promise.resolve().then(giveDilbertAPet).then((body) => {
      should.exist(body.people);
      body.people.length.should.equal(1);
      should.exist(body.people[0].links.pets);
      return Promise.delay(2000);
    }).then(() => {
      return $http.get(`${config.baseUrl}/people/search?id=${id}`);
    }).spread((res, body) => {
      const json = JSON.parse(body);
      should.exist(json.people);
      json.people.length.should.equal(1);
      should.exist(json.people[0].links.pets);
    }).then(() => {
      return $http.patch({ url: `${config.baseUrl}/people/${id}`, json: [
        { path: '/people/0/links/pets', op: 'replace', value: [] }
      ] });
    }).spread((res, body) => {
      res.statusCode.should.equal(200);
      should.exist(body.people);
      body.people.length.should.equal(1);
      should.not.exist(body.people[0].links);
      return Promise.delay(2000);
    }).then(() => {
      return $http.get(`${config.baseUrl}/people/search?id=${id}`);
    }).spread((res, body) => {
      res.statusCode.should.equal(200);
      const json = JSON.parse(body);
      should.exist(json.people);
      json.people.length.should.equal(1);
      should.not.exist(json.people[0].links);
    });
  });

  it('Should correctly sync primary resource deletes', function accessMochaThis() {
    this.timeout(5000);
    const id = ids.people[0];
    return $http.get(`${config.baseUrl}/people/search?id=${id}`).spread((res, body) => {
      res.statusCode.should.equal(200);
      const json = JSON.parse(body);
      should.exist(json.people);
      json.people.length.should.equal(1);
    }).then(() => {
      return killDilbert();
    })

      .spread((res) => {
        res.statusCode.should.equal(204);
        return Promise.delay(2000);
      }).then(() => {
        delete ids.people[0];
        return $http.get(`${config.baseUrl}/people/search?id=${id}`);
      }).spread((res, body) => {
        const json = JSON.parse(body);
        should.exist(json.people);
        json.people.length.should.equal(0);
      }).then(reviveDilbert);
  });


  it('Should correctly sync resources with invalid data graphs', function accessMochaThis() {
    this.timeout(5000);
    const id = ids.people[0];
    return Promise.resolve().then(() => {
      return Promise.all([giveDilbertAPet(), giveDilbertASoulmate()]);
    }).then(() => {
      return Promise.delay(2000);
    }).then(() => {
      return $http.get(`${config.baseUrl}/people/search?id=${id}`);
    }).spread((res, body) => {
      const json = JSON.parse(body);
      should.exist(json.people);
      json.people.length.should.equal(1);
      should.exist(json.people[0].links.pets);
      should.exist(json.people[0].links.soulmate);
    }).then(killRatbert).spread((res) => {
      res.statusCode.should.equal(204);
      return Promise.delay(2000);
    }).then(() => {
      return $http.get(`${config.baseUrl}/people/search?id=${id}`);
    }).spread((res, body) => {
      const ratbertsId = ids.pets[0];
      const wallysId = ids.people[1];
      res.statusCode.should.equal(200);
      const json = JSON.parse(body);
      should.exist(json.people);
      json.people.length.should.equal(1);
      should.exist(json.people[0].links);
      should.exist(json.people[0].links.pets);
      should.exist(json.people[0].links.soulmate);
      wallysId.should.equal(json.people[0].links.soulmate);
      (_.contains(json.people[0].links.pets, ratbertsId)).should.be.false;
    }).then(reviveRatbert);
  });
});
