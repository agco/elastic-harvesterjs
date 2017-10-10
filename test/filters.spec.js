'use strict';

const should = require('should');
const request = require('supertest');
const Promise = require('bluebird');

const seeder = require('./seeder.js');

describe('filters', () => {
  let config;
  let ids;
  beforeEach(function accessMochaThis() {
    config = this.config;
    this.timeout(config.esIndexWaitTime + 1000);
    return seeder(this.harvesterApp).dropCollectionsAndSeed(false, 'people', 'pets').then((result) => {
      ids = result;
      return new Promise((resolve) => {
        const payload = {};

        payload.people = [
          {
            links: {
              pets: [ids.pets[0]]
            }
          }
        ];

        request(config.baseUrl).put(`/people/${ids.people[0]}`).send(payload)
          .expect('Content-Type', /json/).expect(200).end((error, response) => {
            should.not.exist(error);
            const body = JSON.parse(response.text);
            (body.people[0].links.pets).should.containEql(ids.pets[0]);
            resolve();
          });
      }).then(() => {
        return Promise.delay(config.esIndexWaitTime);
      });
    });
  });

  it('should allow top-level resource filtering for search route', (done) => {
    request(config.baseUrl).get('/people/search?name=Dilbert')
      .expect('Content-Type', /json/).expect(200).end((error, response) => {
        should.not.exist(error);
        const body = JSON.parse(response.text);
        body.people.length.should.equal(1);
        done();
      });
  });

  it('should allow top-level resource filtering based on a numeric value', (done) => {
    request(config.baseUrl).get('/people/search?appearances=1934')
      .expect('Content-Type', /json/).expect(200).end((error, response) => {
        should.not.exist(error);
        const body = JSON.parse(response.text);
        body.people.length.should.equal(1);
        done();
      });
  });
  it('should allow combining top-level resource filtering for search route based on string & numeric values',
    (done) => {
      request(config.baseUrl).get('/people/search?name=Dilbert&appearances=3457')
        .expect('Content-Type', /json/).expect(200).end((error, response) => {
          should.not.exist(error);
          const body = JSON.parse(response.text);
          body.people.length.should.equal(1);
          done();
        });
    });

  it('should allow resource sub-document filtering', (done) => {
    // add mapping & do nesting to enable this.
    request(config.baseUrl).get('/people/search?links.pets.name=Dogbert').end((err, response) => {
      should.not.exist(err);
      const body = JSON.parse(response.text);
      body.people.length.should.equal(1);
      done();
    });
  });

  it('should allow resource sub-document filtering combined with subdocument range queries', (done) => {
    // add mapping & do nesting to enable this.
    request(config.baseUrl).get('/people/search?links.pets.name=Dogbert&links.pets.appearances=lt=1935')
      .end((err, response) => {
        should.not.exist(err);
        const body = JSON.parse(response.text);
        body.people.length.should.equal(1);
        done();
      });
  });

  it('should support lt query', (done) => {
    request(config.baseUrl).get('/people/search?appearances=lt=1935').expect(200).end((err, res) => {
      should.not.exist(err);
      const body = JSON.parse(res.text);
      (body.people.length).should.equal(1);
      (body.people[0].name).should.equal('Wally');
      done();
    });
  });
  it('should support le query', (done) => {
    request(config.baseUrl).get('/people/search?appearances=le=1934').expect(200).end((err, res) => {
      should.not.exist(err);
      const body = JSON.parse(res.text);
      (body.people.length).should.equal(1);
      (body.people[0].name).should.equal('Wally');
      done();
    });
  });
  it('should support gt query', (done) => {
    request(config.baseUrl).get('/people/search?appearances=gt=1935').expect(200).end((err, res) => {
      should.not.exist(err);
      const body = JSON.parse(res.text);
      (body.people.length).should.equal(1);
      (body.people[0].name).should.equal('Dilbert');
      done();
    });
  });
  it('should support ge query', (done) => {
    request(config.baseUrl).get('/people/search?appearances=ge=3457').expect(200).end((err, res) => {
      should.not.exist(err);
      const body = JSON.parse(res.text);
      (body.people.length).should.equal(1);
      (body.people[0].name).should.equal('Dilbert');
      done();
    });
  });
  it('should support multiple range queries on the same property', (done) => {
    request(config.baseUrl).get('/people/search?appearances=ge=3457&appearances=lt=3500')
      .expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.people.length).should.equal(1);
        (body.people[0].name).should.equal('Dilbert');
        done();
      });
  });

  it('should support multiple range queries on the same nested property', (done) => {
    request(config.baseUrl).get('/people/search?links.pets.appearances=lt=1904&links.pets.appearances=ge=1903')
      .expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.people.length).should.equal(1);
        (body.people[0].name).should.equal('Dilbert');
        done();
      });
  });

  it('should support multiple range queries on the same nested property', (done) => {
    request(config.baseUrl).get('/people/search?links.pets.appearances=lt=1903&links.pets.appearances=ge=1903')
      .expect(200).end((err, res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.people.length).should.equal(0);
        done();
      });
  });

  it('should support wildcard queries', (done) => {
    request(config.baseUrl).get('/people/search?name=D*').expect(200).end((err, res) => {
      should.not.exist(err);
      const body = JSON.parse(res.text);
      (body.people.length).should.equal(1);
      (body.people[0].name).should.equal('Dilbert');
      done();
    });
  });

  it('should support multi-value queries', (done) => {
    // NOTE: these ids will fail a basic match query lookup, while most other id values will not;
    // they are specially selected and should be retained in any version of this test.
    request(config.baseUrl)
      .get('/people/search?id=b76826d0-0ab6-11e5-a3f4-470467a3b6a8,b767ffc1-0ab6-11e5-a3f4-470467a3b6a8')
      .expect(200)
      .end((err,
        res) => {
        should.not.exist(err);
        const body = JSON.parse(res.text);
        (body.people.length).should.equal(2);
        done();
      });
  });

  it('should support multi-value queries on numeric fields', (done) => {
    request(config.baseUrl).get('/people/search?appearances=1934,3457').expect(200).end((err, res) => {
      should.not.exist(err);
      const body = JSON.parse(res.text);
      (body.people.length).should.equal(2);
      done();
    });
  });
});
