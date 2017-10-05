'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const $http = require('http-as-promised');
const runningAsScript = !module.parent;

const MAX_ENTITIES_TO_PROCESS = 120000;
const PAGE_SIZE = 10000;
const http = require('http');
const postPool = new http.Agent();
postPool.maxSockets = 5;

function promiseWhile(condition, action) {
  const resolver = Promise.defer();

  function loop() {
    if (!condition()) return resolver.resolve();
    return action()
      .then(loop)
      .catch((err) => {
        console.warn(err);
        throw err;
      });
  }

  process.nextTick(loop);

  return resolver.promise;
}

function logEntities(entities, type) {
  console.log(JSON.stringify(_.map(entities[type] || [], (model) => {
    return model.id;
  })));
}

/*
 *** Elastic-Search index reloader. ***
 * -------------------------------- *
 Reload elastic-search index from a syncronized mongo-powered harvester endpoint.
 Meant to be run @cmd line, but can also be required and used in code.

 #Usage: node reloader.js http://localhost:8081/dealers "dealers"
   NB: argv[3] (in this case, "dealers") is optional. If not specified, defaults to the part of the url after the
   last "/".
 */


function Reloader(primarySyncedEndpoint, type, maxSockets) {
  this.uri = primarySyncedEndpoint;
  this.type = type || this.uri.substr(this.uri.lastIndexOf('/') + 1, this.uri.length);
  postPool.maxSockets = maxSockets || postPool.maxSockets;
}

Reloader.prototype.reload = function reload() {
  const _this = this;
  return _this.massGet(MAX_ENTITIES_TO_PROCESS)
    .then((entities) => {
      if (entities[_this.type].length === MAX_ENTITIES_TO_PROCESS) {
        throw new Error(`This server has >${MAX_ENTITIES_TO_PROCESS} entities - ` +
        'please increase MAX_ENTITIES_TO_PROCESS if you want to continue.');
      } else {
        console.log(`Retrieved ${entities[_this.type].length} entities.`);
      }
      logEntities(entities, _this.type);
      return _this.massUpdate(entities);
    });
};

// Reloads in batches so that we can work with very large data sets.
Reloader.prototype.pagedReload = function pagedReload() {
  const reloaderThis = this;
  let lastPageSize;
  let offset = 0;

  return promiseWhile(countIsNotZero, getBatch);

  function countIsNotZero() {
    return lastPageSize !== 0;
  }

  function getBatch() {
    return reloaderThis.massGet(PAGE_SIZE, offset)
      .then((body) => {
        const entities = body[reloaderThis.type];

        lastPageSize = entities.length;
        offset += PAGE_SIZE;
        console.log('OFFSET', offset);
        logEntities(body, reloaderThis.type);
        return reloaderThis.massUpdate(body);
      });
  }
};

Reloader.prototype.massGet = function masGet(limit, offset) {
  console.log('Getting entities');
  return $http.get(`${this.uri}?limit=${limit}&offset=${offset}`,
    { json: {}, pool: postPool })
    .spread((res, body) => {
      return body;
    })
    .catch((e) => {
      console.warn(e);
    });
};


Reloader.prototype.massUpdate = function massUpdate(entities) {
  const _this = this;
  console.log('Triggering re-index of entities:');
  const promises = _.map(entities[_this.type] || [], (model) => {
    const putBody = {};
    const id = model.id;
    delete model.id;
    putBody[_this.type] = [model];

    return $http.put(`${_this.uri}/${id}`, { json: putBody, pool: postPool })
      .spread((res, body) => {
        if (body.error) {
          console.warn(JSON.stringify(body));
          return body;
        }
        console.log(JSON.stringify(body[_this.type][0]));
        return body[_this.type][0];
      })
      .catch((e) => {
        console.warn(e);
      });
  });
  return Promise.all(promises);
};


if (runningAsScript) {
  const reloader = new Reloader(process.argv[2], process.argv[3]);
  reloader.pagedReload();
} else {
  module.exports = Reloader;
}
