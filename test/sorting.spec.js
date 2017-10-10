'use strict';

const should = require('should');
const request = require('supertest');
const Promise = require('bluebird');
const seeder = require('./seeder.js');

describe('sorting', () => {
  let ids;
  let config;

  function addLink(parentEndpoint, parentFixtureIndex, childEndpoint, childFixtureIndex) {
    const payload = {};

    payload[parentEndpoint] = [
      {
        links: {}
      }
    ];
    payload[parentEndpoint][0].links[childEndpoint] = [ids[childEndpoint][childFixtureIndex]];

    return new Promise((resolve, reject) => {
      request(config.baseUrl)
        .put(`/${parentEndpoint}/${ids[parentEndpoint][parentFixtureIndex]}`)
        .send(payload).expect('Content-Type', /json/)
        .expect(200)
        .end((error, response) => {
          should.not.exist(error);
          if (error) {
            return reject(error);
          }
          const body = JSON.parse(response.text);
          (body[parentEndpoint][0].links[childEndpoint]).should.containEql(ids[childEndpoint][childFixtureIndex]);
          return resolve();
        });
    });
  }

  beforeEach(function accessMochaThis() {
    config = this.config;
    this.timeout(config.esIndexWaitTime * 2 + 1000);
    return seeder(this.harvesterApp).dropCollectionsAndSeed('pets', 'people')
      .then((result) => {
        ids = result;

        return addLink('people', 0, 'pets', 0)
          .then(() => {
            return addLink('people', 1, 'pets', 1);
          })
          .then(() => {
            return Promise.delay(config.esIndexWaitTime);
          });
      });
  });

  describe('nested sorting', () => {
    it('should be possible to do a nested sort, ascending on numeric fields', (done) => {
      request(config.baseUrl).get('/people/search?sort=links.pets.appearances&include=pets&limit=1')
        .expect(200).end((err, res) => {
          should.not.exist(err);
          const body = JSON.parse(res.text);
          should.exist(body.linked);
          should.exist(body.linked.pets);
          (body.people[0].name).should.equal('Wally');
          done();
        });
    });

    it('should be possible to do a nested sort, descending on numeric fields', (done) => {
      request(config.baseUrl).get('/people/search?sort=-links.pets.appearances&include=pets&limit=1')
        .expect(200).end((err, res) => {
          should.not.exist(err);
          const body = JSON.parse(res.text);
          should.exist(body.linked);
          should.exist(body.linked.pets);
          (body.people[0].name).should.equal('Dilbert');
          done();
        });
    });

    it('should be possible to do a nested sort, ascending on text fields', (done) => {
      request(config.baseUrl).get('/people/search?sort=links.pets.name&include=pets&limit=1')
        .expect(200).end((err, res) => {
          should.not.exist(err);
          const body = JSON.parse(res.text);
          should.exist(body.linked);
          should.exist(body.linked.pets);
          (body.people[0].name).should.equal('Dilbert');
          done();
        });
    });

    it('should be possible to do a nested sort, descending on text fields', (done) => {
      request(config.baseUrl).get('/people/search?sort=-links.pets.name&include=pets&limit=1')
        .expect(200).end((err, res) => {
          should.not.exist(err);
          const body = JSON.parse(res.text);
          should.exist(body.linked);
          should.exist(body.linked.pets);
          (body.people[0].name).should.equal('Wally');
          done();
        });
    });

    it('should be possible to combine sorting on nested and un-nested fields', (done) => {
      request(config.baseUrl).get('/people/search?sort=appearances,links.pets.name').expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.people[0].name).should.equal('Wally');
        done();
      });
    });
  });

  describe('regular sorting', () => {
    it('should be possible to sort ascending on numeric fields', (done) => {
      request(config.baseUrl).get('/people/search?sort=appearances').expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.people[0].name).should.equal('Wally');
        done();
      });
    });

    it('should be possible to combine sorting on numeric and text fields', (done) => {
      request(config.baseUrl).get('/people/search?sort=appearances,name').expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.people[0].name).should.equal('Wally');
        done();
      });
    });

    it('should be possible to sort descending on numeric fields', (done) => {
      request(config.baseUrl).get('/people/search?sort=-appearances').expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.people[0].name).should.equal('Dilbert');
        done();
      });
    });

    it('should be possible to sort ascending on text fields', (done) => {
      request(config.baseUrl).get('/people/search?sort=name').expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.people[0].name).should.equal('Dilbert');
        done();
      });
    });

    it('should be possible to sort descending on text fields', (done) => {
      request(config.baseUrl).get('/people/search?sort=-name').expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.people[0].name).should.equal('Wally');
        done();
      });
    });
  });
});
