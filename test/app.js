var harvest = require('harvest');
var RSVP = require('rsvp');
var ElasticHarvest = require('../elastic-harvest');

function createApp(options) {
    var harvestApp = harvest(options)

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
            toys:['toy']
        })

        .resource('toy', {
            name: String
        })


    var peopleSearch = new ElasticHarvest(harvestApp, options.es_url,options.es_index, "people");
    harvestApp.router.get('/people/search', peopleSearch.route);

    harvestApp.onRouteCreated('person').then(function(harvestRoute){
        peopleSearch.setHarvestRoute(harvestRoute);
    });

    peopleSearch.enableAutoSync("person");

    return RSVP.all([
        harvestApp.onRouteCreated('pet'),
        harvestApp.onRouteCreated('person')
    ])
        .then(function () {
            harvestApp.listen(process.env.PORT);
            return harvestApp;
        });
}





module.exports = createApp;
