var woodman = require('woodman');
var _ = require("lodash");

// since this initiates the code with a worker process we need to configure woodman
woodman.load('console %domain - %message');
var logger = woodman.getLogger('events-reader');

// initiate the oplog eventsReader with the Mongodb oplog url and optionally start tailing
module.exports = function (harvestApp) {
    (!harvestApp.options.oplogConnectionString) && (function () {
        throw new Error("Missing config.options.oplogConnectionString")
    }());

    return harvestApp.eventsReader(harvestApp.options.oplogConnectionString).then(function (EventsReader) {
        logger.info('start tailing the oplog');
        var eventsReader = new EventsReader();
        eventsReader.tail();
        return eventsReader;
    }).catch(function (e) {
            logger.error(e);
            throw e;
        });
};
