var harvester = require('harvesterjs');
var ElasticHarvest = require('../elastic-harvester');
var Promise = require('bluebird');
var Joi = require('joi');

var config = require('./config.js');

function configureApp(harvesterApp) {
    var peopleSearch, equipmentSearch, warriorSearch;
    //This circumvents a dependency issue between harvest and elastic-harvest.
    harvesterApp.router.get('/people/search', function () {
        peopleSearch.route.apply(peopleSearch, arguments);
    });
    harvesterApp.router.get('/equipment/search', function () {
        equipmentSearch.route.apply(equipmentSearch, arguments);
    });
    harvesterApp.router.get('/warriors/search', function () {
        warriorSearch.route.apply(warriorSearch, arguments);
    });

    var options = harvesterApp.options;

    harvesterApp.resource('person', {
        name: Joi.string(),
        appearances: Joi.number(),
        dateOfBirth: Joi.date(),
        links: {
            pets: ['pet'],
            soulmate: {ref: 'person', inverse: 'soulmate'},
            lovers: [
                {ref: 'person', inverse: 'lovers'}
            ]
        }
    }).resource('pet', {
            name: Joi.string(),
            appearances: Joi.number(),
            links:{
                toys: ['toy'],
                friends: ['pet']
            }
        }).resource('toy', {
            name: Joi.string()
        }).resource('equipment', {
            name: Joi.string(),
            links: {
                dealer: { ref: 'dealer', baseUri: 'http://localhost:' + (config.harvester.port + 1) }
            }
        }).resource('warrior', {
            name: Joi.string(),
            links: {
                weapon: 'equipment'
            }
        });

    peopleSearch = new ElasticHarvest(harvesterApp, options.es_url, options.es_index, "people");
    peopleSearch.setHarvestRoute(harvesterApp.createdResources['person']);
    peopleSearch.enableAutoSync("person");
    peopleSearch.enableAutoIndexUpdate();

    equipmentSearch = new ElasticHarvest(harvesterApp, options.es_url, options.es_index, 'equipment');
    equipmentSearch.setHarvestRoute(harvesterApp.createdResources['equipment']);
    equipmentSearch.enableAutoSync('equipment');
    equipmentSearch.enableAutoIndexUpdate();

    warriorSearch = new ElasticHarvest(harvesterApp, options.es_url, options.es_index, 'warriors');
    warriorSearch.setHarvestRoute(harvesterApp.createdResources['warrior']);
    warriorSearch.enableAutoSync('warrior');
    warriorSearch.enableAutoIndexUpdate();

    return peopleSearch.deleteIndex().then(function () {
        return peopleSearch.initializeMapping(require("./people.mapping.js"));
    }).then(function (response) {
        console.log('Initializing ES mapping: ' + JSON.stringify(response));
        return equipmentSearch.initializeMapping(require("./equipment.mapping.js"));
    }).then(function (response) {
        console.log('Initializing ES mapping: ' + JSON.stringify(response));
        return warriorSearch.initializeMapping(require("./warriors.mapping.js"));
    }).then(function (response) {
        console.log('Initializing ES mapping: ' + JSON.stringify(response));
        return [harvesterApp, peopleSearch];
    });
}

function createAndConfigure() {
    var app = harvester(config.harvester.options);
    return configureApp(app);
}

/**
 * Creates instance of harvester app with default routes.
 *
 * This function can be safely passed to before or beforeEach as it will attempt install app and config into mocha's context
 *
 * beforeEach(require('./app.js'));
 *
 * @returns {*} promise resolving to harvester app instance
 */
module.exports = function () {
    var that = this;
    return createAndConfigure().spread(function (app, peopleSearch) {
        app.listen(config.harvester.port);
        that.harvesterApp = app;
        that.peopleSearch = peopleSearch;
        that.config = config;
        return app;
    });
};
