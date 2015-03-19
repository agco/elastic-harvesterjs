var harvest = require('harvesterjs');
var ElasticHarvest = require('../elastic-harvester');

function createApp(options) {

    var harvestApp = harvest(options);
    var peopleSearch;
    var elasticHarvestRoute;
    //This circumvents a dependency issue between harvest and elastic-harvest.
    harvestApp.router.get('/people/search', function(){
        elasticHarvestRoute.apply(peopleSearch,arguments);
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

    peopleSearch = new ElasticHarvest(harvestApp, options.es_url,options.es_index, "people");
    elasticHarvestRoute = peopleSearch.route;

    var indexReadyPromise = peopleSearch.deleteIndex().then(function(){
        return peopleSearch.initializeMapping(require("./test.mapping.js")).then(function(response){
            console.log('Initializing ES mapping: ' + JSON.stringify(response));
        });
    });


    peopleSearch.setHarvestRoute(harvestApp.route('person'));
    peopleSearch.enableAutoSync("person");

    return indexReadyPromise
        .then(function () {
            harvestApp.listen(process.env.PORT);
            return harvestApp;
        });
}

module.exports = createApp;