var harvest = require('harvesterjs');
var ElasticHarvest = require('../elastic-harvester');
var Promise = require('bluebird');

function createApp(options) {

    var shouldRunES=(options.es_url && options.es_index);

    var harvestApp = harvest(options);
    var peopleSearch;
    //This circumvents a dependency issue between harvest and elastic-harvest.
    shouldRunES && harvestApp.router.get('/people/search', function(){
        peopleSearch.route.apply(peopleSearch,arguments);
    });

    harvestApp
        .resource('person', {
            name: String,
            appearances: Number,
            pets: ['pet'],
            soulmate: {ref: 'person', inverse: 'soulmate'},
            lovers: [{ref: 'person', inverse: 'lovers'}]
        })
        .resource('pet', {
            name: String,
            appearances: Number,
            toys:['toy'],
            friends:['pet']
        })
        .resource('toy', {
            name: String
        });

    if(shouldRunES){
        peopleSearch = new ElasticHarvest(harvestApp, options.es_url,options.es_index, "people");
        peopleSearch.setHarvestRoute(harvestApp.route('person'));
        peopleSearch.enableAutoSync("person");
        peopleSearch.enableAutoIndexUpdate();

        return peopleSearch.deleteIndex()
            .then(function(){
                return peopleSearch.initializeMapping(require("./test.mapping.js"));
            })
            .then(function(response){
                console.log('Initializing ES mapping: ' + JSON.stringify(response));
                return harvestApp;
            });
    }else{
        return Promise.resolve(harvestApp);
    }

}

module.exports = createApp;