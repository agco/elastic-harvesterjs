var woodman = require('woodman'),
    config = require('./config'),
    harvestAppPromise = require('./app.js')(config.options),
    _ = require("lodash");

// since this initiates the code with a worker process we need to configure woodman
woodman.load('console %domain - %message');
var logger = woodman.getLogger('events-reader');

// initiate the oplog eventsReader with the Mongodb oplog url and optionally start tailing
module.exports = harvestAppPromise.then(function(harvestApp){
    (!config.options.oplogConnectionString) && (function(){throw new Error("Missing config.options.oplogConnectionString")}());

    return harvestApp.eventsReader(config.options.oplogConnectionString)
        .then(function (EventsReader) {
            logger.info('start tailing the oplog');
            var eventsReader = new EventsReader();
            eventsReader.tail();
            return eventsReader;
        })
        .catch(function(e) {
            logger.error(e);
        });
});

