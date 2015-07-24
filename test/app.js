var harvester = require('harvesterjs');
var ElasticHarvest = require('../elastic-harvester');
var Promise = require('bluebird');
var Joi = require('joi');

var config = require('./config.js');

function configureApp(harvesterApp) {
    var peopleSearch;
    //This circumvents a dependency issue between harvest and elastic-harvest.
    harvesterApp.router.get('/people/search', function () {
        peopleSearch.route.apply(peopleSearch, arguments);
    });

    var options = harvesterApp.options;

    harvesterApp.resource('person', {
        name: Joi.string(),
        appearances: Joi.number(),
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
        });

    peopleSearch = new ElasticHarvest(harvesterApp, options.es_url, options.es_index, "people");
    peopleSearch.setHarvestRoute(harvesterApp.createdResources['person']);
    peopleSearch.enableAutoSync("person");
    peopleSearch.enableAutoIndexUpdate();

    return peopleSearch.deleteIndex().then(function () {
        return peopleSearch.initializeMapping(require("./test.mapping.js"));
    }).then(function (response) {
            console.log('Initializing ES mapping: ' + JSON.stringify(response));
            return harvesterApp;
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
    return createAndConfigure().then(function (app) {
        app.listen(config.harvester.port);
        that.harvesterApp = app;
        that.config = config;
        return app;
    });
};
