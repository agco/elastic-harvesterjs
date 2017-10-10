'use strict';

const woodman = require('woodman');

// since this initiates the code with a worker process we need to configure woodman
woodman.load('console %domain - %message');
const logger = woodman.getLogger('events-reader');

// initiate the oplog eventsReader with the Mongodb oplog url and optionally start tailing
module.exports = (harvestApp) => {
  (!harvestApp.options.oplogConnectionString) && (() => {
    throw new Error('Missing config.options.oplogConnectionString');
  })();

  return harvestApp.eventsReader(harvestApp.options.oplogConnectionString).then((EventsReader) => {
    logger.info('start tailing the oplog');
    const eventsReader = new EventsReader();
    eventsReader.tail();
    return eventsReader;
  }).catch((e) => {
    logger.error(e);
    throw e;
  });
};
