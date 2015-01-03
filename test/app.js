var fortune = require('fortune-agco');
var RSVP = require('rsvp');
var ElasticFortune = require('../elastic-fortune');

function createApp(options) {
    var fortuneApp = fortune(options)

        .resource('person', {
            name: String,
            appearances: Number,
            pets: ['pet'],
            soulmate: {ref: 'person', inverse: 'soulmate'},
            lovers: [{ref: 'person', inverse: 'lovers'}]
        })

        .resource('pet', {
            name: String,
            appearances: Number
        })

    var collectionNameLookup = {
        "soulmate": "person",
        "lovers": "person",
        "pets":"pet",
        "owner":"person"
    };

    var peopleSearch = new ElasticFortune(fortuneApp, options.es_url,options.es_index, "people", collectionNameLookup);
    fortuneApp.router.get('/people/search', peopleSearch.route);

    fortuneApp.onRouteCreated('person').then(function(fortuneRoute){
        peopleSearch.setFortuneRoute(fortuneRoute);
    });

    peopleSearch.enableAutoSync("person");

    return RSVP.all([
        fortuneApp.onRouteCreated('pet'),
        fortuneApp.onRouteCreated('person')
    ])
        .then(function () {
            fortuneApp.listen(process.env.PORT);
            return fortuneApp;
        });
}





module.exports = createApp;
