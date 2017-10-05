'use strict';

const harvester = require('harvesterjs');
const ElasticHarvest = require('../elastic-harvester');
const Joi = require('joi');

const config = require('./config.js');


const personCustomRoutingKeyPath = 'name'; // used in the customRouting.spec.js tests
const warriorCustomRoutingKeyPath = 'links.weapon.id'; // used in the customRouting.spec.js tests


function configureApp(harvesterApp) {
  let peopleSearch; // eslint-disable-line prefer-const
  let equipmentSearch; // eslint-disable-line prefer-const
  let warriorSearch; // eslint-disable-line prefer-const
  // This circumvents a dependency issue between harvest and elastic-harvest.
  harvesterApp.router.get('/people/search', function doNotUseArrow() {
    peopleSearch.route.apply(peopleSearch, arguments);
  });
  harvesterApp.router.get('/equipment/search', function doNotUseArrow() {
    equipmentSearch.route.apply(equipmentSearch, arguments);
  });
  harvesterApp.router.get('/warriors/search', function doNotUseArrow() {
    warriorSearch.route.apply(warriorSearch, arguments);
  });

  const options = harvesterApp.options;

  harvesterApp.resource('person', {
    name: Joi.string(),
    appearances: Joi.number(),
    dateOfBirth: Joi.date(),
    links: {
      pets: ['pet'],
      soulmate: { ref: 'person', inverse: 'soulmate' },
      lovers: [
        { ref: 'person', inverse: 'lovers' }
      ]
    }
  }).resource('pet', {
    name: Joi.string(),
    appearances: Joi.number(),
    links: {
      toys: ['toy'],
      friends: ['pet']
    }
  }).resource('toy', {
    name: Joi.string()
  }).resource('equipment', {
    name: Joi.string(),
    links: {
      dealer: { ref: 'dealer', baseUri: `http://localhost:${config.harvester.port + 1}` }
    }
  }).resource('warrior', {
    name: Joi.string(),
    links: {
      weapon: 'equipment'
    }
  });

  peopleSearch = new ElasticHarvest(harvesterApp, options.es_url, options.es_index, 'people');
  peopleSearch.setHarvestRoute(harvesterApp.createdResources.person);
  peopleSearch.enableAutoSync('person');
  peopleSearch.enableAutoIndexUpdate();
  peopleSearch.setPathToCustomRoutingKey(personCustomRoutingKeyPath);

  equipmentSearch = new ElasticHarvest(harvesterApp, options.es_url, options.es_index, 'equipment');
  equipmentSearch.setHarvestRoute(harvesterApp.createdResources.equipment);
  equipmentSearch.enableAutoSync('equipment');
  equipmentSearch.enableAutoIndexUpdate();

  warriorSearch = new ElasticHarvest(harvesterApp, options.es_url, options.es_index, 'warriors');
  warriorSearch.setHarvestRoute(harvesterApp.createdResources.warrior);
  warriorSearch.enableAutoSync('warrior');
  warriorSearch.enableAutoIndexUpdate();
  warriorSearch.setPathToCustomRoutingKey(warriorCustomRoutingKeyPath);

  return peopleSearch.deleteIndex().then(() => {
    return peopleSearch.initializeMapping(require('./people.mapping.js'));
  }).then((response) => {
    console.log(`Initializing ES mapping: ${JSON.stringify(response)}`);
    return equipmentSearch.initializeMapping(require('./equipment.mapping.js'));
  }).then((response) => {
    console.log(`Initializing ES mapping: ${JSON.stringify(response)}`);
    return warriorSearch.initializeMapping(require('./warriors.mapping.js'));
  }).then((response) => {
    console.log(`Initializing ES mapping: ${JSON.stringify(response)}`);
    return [harvesterApp, peopleSearch];
  });
}

function createAndConfigure() {
  const app = harvester(config.harvester.options);
  return configureApp(app);
}

/**
 * Creates instance of harvester app with default routes.
 *
 * This function can be safely passed to before or beforeEach as it will attempt install app and config into mocha's
 * context
 *
 * beforeEach(require('./app.js'));
 *
 * @returns {*} promise resolving to harvester app instance
 */
module.exports = function accessMochaThis() {
  const that = this;
  that.personCustomRoutingKeyPath = personCustomRoutingKeyPath;
  that.warriorCustomRoutingKeyPath = warriorCustomRoutingKeyPath;
  return createAndConfigure().spread((app, peopleSearch) => {
    app.listen(config.harvester.port);
    that.harvesterApp = app;
    that.peopleSearch = peopleSearch;
    that.config = config;
    return app;
  });
};
