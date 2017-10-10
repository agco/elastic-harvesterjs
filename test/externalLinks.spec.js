'use strict';

const _ = require('lodash');
const Joi = require('joi');
const harvester = require('harvesterjs');
const should = require('should');
const Promise = require('bluebird');

const request = require('supertest');
const seeder = require('./seeder.js');
const config = require('./config.js');

describe('Syncing external links', () => {
  describe('when remote API is down', () => {
    before(function accessMochaThis() {
      this.timeout(config.esIndexWaitTime + 1000);
      const harvesterApp = this.harvesterApp;
      return Promise.map(['equipment', 'warriors', 'people'], (key) => {
        return seeder(harvesterApp).dropCollectionsAndSeed(key);
      });
    });

    it('should allow searching on id from linked entity from remote API', (done) => {
      request(config.baseUrl).get('/equipment/search?links.dealer.id=d767ffc1-0ab6-11e5-a3f4-470467a3b6a8')
        .expect(200).end((err, res) => {
          should.not.exist(err);
          const body = JSON.parse(res.text);
          body.equipment.length.should.equal(1);
          body.equipment[0].links.should.have.property('dealer', 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8');
          done();
        });
    });
    it('should allow searching on id from nested linked entity from remote API', (done) => {
      request(config.baseUrl).get('/warriors/search?links.weapon.dealer.id=d767ffc1-0ab6-11e5-a3f4-470467a3b6a8')
        .expect(200).end((err, res) => {
          should.not.exist(err);
          const body = JSON.parse(res.text);
          body.warriors.length.should.equal(1);
          body.warriors[0].links.should.have.property('weapon', 'b767ffc1-0ab6-11e5-a3f4-470467a3b6a8');
          done();
        });
    });
    it.skip('should allow including remote links', (done) => {
      /**
       * This test is skipped because impl responds with 400, and I don't think it's correct
       */
      request(config.baseUrl).get('/equipment/search?include=dealer' +
        '&links.dealer.id=d767ffc1-0ab6-11e5-a3f4-470467a3b6a8')
        .expect(200).end((err, res) => {
          should.not.exist(err);
          const body = JSON.parse(res.text);
          body.equipment.length.should.equal(1);
          body.equipment[0].links.should.have.property('dealer', 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8');
          body.linked.should.have.property('dealers', [
            { id: 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8', name: 'Dilear' }
          ]);
          done();
        });
    });
  });

  describe('when remote API is up', () => {
    before(function accessMochaThis() {
      const mainHarvesterApp = this.harvesterApp;
      this.timeout(config.esIndexWaitTime + 1000);
      const options = _.cloneDeep(config.harvester.options);
      options.db = 'ehTestDb2';
      options.connectionString = `mongodb://127.0.0.1:27017/${options.db}`;
      const harvesterApp2 = harvester(options);
      const port = config.harvester.port + 1;
      harvesterApp2.resource('dealer', {
        name: Joi.string()
      }).listen(port);
      const seederInstance = seeder(harvesterApp2, `http://localhost:${port}`);
      return seederInstance.dropCollections('dealers').then(() => {
        return seederInstance.seedCustomFixture({ dealers: [
          {
            id: 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8',
            name: 'Dilear'
          }
        ] });
      }).then(() => {
        return seeder(mainHarvesterApp).dropCollectionsAndSeed('equipment');
      });
    });

    it('should allow searching on id from linked entity from remote API', (done) => {
      request(config.baseUrl).get('/equipment/search?links.dealer.id=d767ffc1-0ab6-11e5-a3f4-470467a3b6a8')
        .expect(200).end((err, res) => {
          should.not.exist(err);
          const body = JSON.parse(res.text);
          body.equipment.length.should.equal(1);
          body.equipment[0].links.should.have.property('dealer', 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8');
          done();
        });
    });

    it('should allow searching on id from linked entity from remote API', (done) => {
      request(config.baseUrl).get('/equipment/search?links.dealer.id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        .expect(200).end((err, res) => {
          should.not.exist(err);
          const body = JSON.parse(res.text);
          body.equipment.length.should.equal(1);
          body.equipment[0].links.should.have.property('dealer', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
          done();
        });
    });

    it('should allow including remote links', (done) => {
      request(config.baseUrl).get('/equipment/search?include=dealer' +
        '&links.dealer.id=d767ffc1-0ab6-11e5-a3f4-470467a3b6a8')
        .expect(200).end((err, res) => {
          should.not.exist(err);
          const body = JSON.parse(res.text);
          body.equipment.length.should.equal(1);
          body.equipment[0].links.should.have.property('dealer', 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8');
          body.linked.should.have.property('dealers', [
            { id: 'd767ffc1-0ab6-11e5-a3f4-470467a3b6a8', name: 'Dilear' }
          ]);
          done();
        });
    });
  });
});

