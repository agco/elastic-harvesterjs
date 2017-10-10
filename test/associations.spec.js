'use strict';

const should = require('should');
const Promise = require('bluebird');
const request = require('supertest');
const addLink = require('./util').addLink;

const seeder = require('./seeder.js');

describe('associations', () => {
  let config;
  let ids;

  before(function accessMochaThis() {
    config = this.config;
    this.timeout(config.esIndexWaitTime + 1000);
    return seeder(this.harvesterApp).dropCollectionsAndSeed('people', 'pets').then((result) => {
      ids = result;
    });
  });

  it('should be able to add circularly linked documents', function accessMochaThis(done) {
    this.timeout(config.esIndexWaitTime + 1000);
    const linkObj1 = { friends: [ids.pets[1]] };
    const linkObj2 = { friends: [ids.pets[0]] };
    const linkObj3 = { pets: [ids.pets[0]] };

    const promises = [];
    // lets make friends!
    promises.push(addLink('pets', linkObj1, config.baseUrl, `/pets/${ids.pets[0]}`));
    promises.push(addLink('pets', linkObj2, config.baseUrl, `/pets/${ids.pets[1]}`));

    Promise.all(promises).then(() => {
      // Now trigger re-index & expansion of a person.
      addLink('people', linkObj3, config.baseUrl, `/people/${ids.people[0]}`).then(() => {
        setTimeout(() => {
          request(config.baseUrl).get(`/people/search?links.pets.friends.friends.id=${ids.pets[0]}`)
            .expect('Content-Type',
              /json/).expect(200).end((error, response) => {
              should.not.exist(error);
              const body = JSON.parse(response.text);
              (body.people[0].id.should.match(ids.people[0]));
              done();
            });
        }, config.esIndexWaitTime);
      });
    });
  });
});
