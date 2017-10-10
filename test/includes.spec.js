'use strict';

const should = require('should');
const request = require('supertest');
const Promise = require('bluebird');
const seeder = require('./seeder.js');

describe('includes', () => {
  let config;
  let ids;

  before(function accessMochaThis() {
    config = this.config;
  });

  function linkToysWithPets() {
    const payload = {};

    payload.pets = [
      {
        links: {
          toys: [ids.toys[0]]
        }
      }
    ];

    return request(config.baseUrl).put(`/pets/${ids.pets[0]}`).send(payload).expect('Content-Type', /json/).expect(200);
  }

  function linkPeopleWithPets() {
    const payload = {};

    payload.people = [
      {
        links: {
          pets: [ids.pets[0]]
        }
      }
    ];

    return request(config.baseUrl)
      .put(`/people/${ids.people[0]}`).send(payload).expect('Content-Type', /json/).expect(200);
  }

  describe('should be able to add linked documents', () => {
    before(function accessMochaThis() {
      this.timeout(config.esIndexWaitTime + 1000);
      return seeder(this.harvesterApp).dropCollectionsAndSeed('people', 'pets', 'toys').then((result) => {
        ids = result;
      });
    });
    it('i.e. toys to pets', (done) => {
      linkToysWithPets().end((error, response) => {
        should.not.exist(error);
        const body = JSON.parse(response.text);
        (body.pets[0].links.toys).should.containEql(ids.toys[0]);
        done();
      });
    });

    it('i.e. pets to people', (done) => {
      linkPeopleWithPets().end((error, response) => {
        should.not.exist(error);
        const body = JSON.parse(response.text);
        (body.people[0].links.pets).should.containEql(ids.pets[0]);
        done();
      });
    });
  });

  describe('when documents are linked', () => {
    before(function accessMochaThis() {
      this.timeout(config.esIndexWaitTime + 1000);
      return seeder(this.harvesterApp).dropCollectionsAndSeed(false, 'people', 'pets', 'toys').then((result) => {
        ids = result;
        const peopleAndPetsPromise = new Promise((resolve, reject) => {
          linkPeopleWithPets().end((err) => {
            err ? reject(err) : resolve();
          });
        });
        const toysAndPetsPromise = new Promise((resolve, reject) => {
          linkToysWithPets().end((err) => {
            err ? reject(err) : resolve();
          });
        });
        return Promise.all([peopleAndPetsPromise, toysAndPetsPromise]).then(() => {
          return Promise.delay(config.esIndexWaitTime);
        });
      });
    });

    it('should include linked resources when requested', (done) => {
      request(config.baseUrl).get('/people/search?include=pets').expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.linked).should.be.an.Object;
        (body.linked.pets).should.be.an.Array;
        (body.linked.pets.length).should.be.above(0);
        done();
      });
    });

    it('should have links appended to results', (done) => {
      request(config.baseUrl).get('/people/search').expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        should.exist(body.links);
        should.exist(body.links['people.pets']);
        should.exist(body.links['people.soulmate']);
        should.exist(body.links['people.lovers']);
        done();
      });
    });

    it('should add links for linked entities to links appended to results', (done) => {
      request(config.baseUrl).get('/people/search?include=pets').expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        should.exist(body.links);
        should.exist(body.links['pets.toys']);
        done();
      });
    });
  });
});
