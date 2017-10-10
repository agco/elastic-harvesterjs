'use strict';

// dependencies
const _ = require('lodash');
const chai = require('chai');
const expect = chai.expect;
const $http = require('http-as-promised');
const Promise = require('bluebird');

// locals
const seeder = require('./seeder.js');
const fixtures = require('./fixtures')();

describe('#syncIndex', () => {
  let config;
  beforeEach(function accessMochaThis() {
    config = this.config;
    this.timeout(config.esIndexWaitTime + 10000);
    return seeder(this.harvesterApp).dropCollectionsAndSeed('people', 'pets')
      .then(linkPeopleWithPets);

    function linkPeopleWithPets() {
      const payload = {
        people: [
          {
            links: {
              pets: [fixtures.pets[0].id]
            }
          }
        ]
      };

      return $http.put(`${config.baseUrl}/people/${fixtures.people[0].id}`, { json: payload })
        .spread((res) => {
          expect(res.statusCode).to.equal(200);
          return Promise.delay(config.esIndexWaitTime);
        });
    }
  });

  it('has valid people data', () => {
    return $http.get(`${config.baseUrl}/people/search?include=pets`, { json: true }).spread((res) => {
      expect(res.statusCode).to.equal(200);
    });
  });

  it('works!', function accessMochaThis() {
    const dog = fixtures.pets[0];

    this.timeout(config.esIndexWaitTime + 10000);
    dog.name = 'dogebert'; // this assignment and the syncIndex below appear to have no affect on this test...
    return this.peopleSearch.syncIndex('pets', 'update', dog)
      .delay(config.esIndexWaitTime)
      .then(() => {
        return $http.get(`${config.baseUrl}/people/search?include=pets`, { json: true });
      })
      .spread((res, body) => {
        expect(res.statusCode).to.equal(200);
        const personOfInterest = _.find(body.people, { name: 'Dilbert' });
        expect(personOfInterest.links.pets[0]).to.equal(dog.id);
      });
  });
});
