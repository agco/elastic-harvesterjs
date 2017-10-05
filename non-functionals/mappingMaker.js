'use strict';

const inflect = require('i')();
const _ = require('lodash');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const options = {
  adapter: 'mongodb',
  connectionString: 'mongodb://127.0.0.1:27017/testDB',
  db: 'testDB',
  inflect: true
};
console.log(JSON.stringify(options));
const runningAsScript = !module.parent;

/*
 *** Elastic-Search mapping maker. ***
 * -------------------------------- *
 Generate scaffolded elastic-search mapping from a harvester app.
 Meant to be run @cmd line, but can also be required and used in code.

 #Usage: node mappingMaker.js path-to-harvester-app primary-es-graph-resource(e.g. people) file-to-create.json
 NB: argv[3] (in this case, "file-to-create.json") is optional. If not specified, no file will be written to disk;
 instead the mapping will
 be console.logged.
 */

const functionTypeLookup = {
  'function Stri': 'string',
  'function Numb': 'number',
  'function Bool': 'boolean',
  'function Date': 'date',
  'function Buff': 'buffer',
  'function Arra': 'array'
};

function getFunctionType(fn) {
  return functionTypeLookup[fn.toString().substr(0, 13)];
}

function MappingMaker() {

}


MappingMaker.prototype.generateMapping = function generateMapping(harvestApp, pov, outputFile) {
  let harvesterApp;
  if (_.isString(harvestApp)) {
    harvesterApp = require(harvestApp)(options);
  } else {
    harvesterApp = Promise.resolve(harvestApp);
  }
  return harvesterApp
    .catch() // harvestApp doesn't have to work perfectly; we just need its schemas.
    .then((_harvesterApp) => {
      return make(_harvesterApp, pov);
    })
    .then((mappingData) => {
      if (outputFile) {
        console.log(`Saving mapping to ${outputFile}`);
        return fs.writeFileAsync(outputFile, JSON.stringify(mappingData, null, 4)).then(() => {
          console.log('Saved.');

          return mappingData;
        }).error((e) => {
          console.error('Unable to save file, because: ', e.message);
        });
      }
      console.log('Generated Mapping: ');
      console.log(JSON.stringify(mappingData, null, 4));
      return mappingData;
    });
};

function make(harvestApp, pov) {
  const schemaName = inflect.singularize(pov);
  const startingSchema = harvestApp._schema[schemaName];

  const maxDepth = 4;
  const _depth = 0;

  const retVal = {};
  retVal[pov] = { properties: {} };
  const _cursor = retVal[pov].properties;

  function getNextLevelSchema(propertyName, propertyValue, cursor, depth) {
    let nextCursor;

    if (depth === 1) {
      cursor.links = cursor.links || { type: 'nested' };
      cursor.links.properties = cursor.links.properties || {};
      cursor.links.properties[propertyName] = {
        type: 'nested',
        properties: {}
      };
      nextCursor = cursor.links.properties[propertyName].properties;
    } else {
      if (depth === maxDepth) {
        return;
      }
      cursor[propertyName] = {
        type: 'nested',
        properties: {}
      };
      nextCursor = cursor[propertyName].properties;
    }
    harvestApp._schema[propertyValue] && getLinkedSchemas(harvestApp._schema[propertyValue], nextCursor, depth);
  }

  function getLinkedSchemas(_startingSchema, cursor, depth) {
    if (depth >= maxDepth) {
      console.warn(`[Elastic-harvest] Graph depth of ${depth} exceeds ${maxDepth}. Graph dive halted prematurely` +
        ' - please investigate.'); // harvest schema may have circular references.
      return null;
    }

    const __depth = depth + 1;

    _.each(_startingSchema, (propertyValue, propertyName) => {
      if (typeof propertyValue !== 'function') {
        if (_.isString(propertyValue)) {
          getNextLevelSchema(propertyName, propertyValue, cursor, __depth);
        } else if (_.isArray(propertyValue)) {
          if (_.isString(propertyValue[0])) {
            getNextLevelSchema(propertyName, propertyValue[0], cursor, __depth);
          } else {
            getNextLevelSchema(propertyName, propertyValue[0].ref, cursor, __depth);
          }
        } else if (_.isObject(propertyValue)) {
          getNextLevelSchema(propertyName, propertyValue.ref, cursor, __depth);
        }
      } else {
        const fnType = getFunctionType(propertyValue);
        if (fnType === 'string') {
          cursor.id = {
            type: 'string',
            index: 'not_analyzed'
          };
          cursor[propertyName] = {
            type: 'string',
            index: 'not_analyzed'
          };
        } else if (fnType === 'number') {
          cursor[propertyName] = {
            type: 'long'
          };
        } else if (fnType === 'date') {
          cursor[propertyName] = {
            type: 'date'
          };
        } else if (fnType === 'boolean') {
          cursor[propertyName] = {
            type: 'boolean'
          };
        } else if (fnType === 'array') {
          console.warn('[mapping-maker] Array-type scaffolding not yet implemented; ' +
          `The elastic-search mapping scaffolded for this app will be incomplete wrt '${propertyName}' property.`);
        } else if (fnType === 'buffer') {
          console.warn('[mapping-maker] Buffer-type scaffolding not yet implemented; ' +
          `The elastic-search mapping scaffolded for this app will be incomplete wrt '${propertyName}' property.`);
        } else {
          console.warn('[mapping-maker] unsupported type; ' +
          `The elastic-search mapping scaffolded for this app will be incomplete wrt '${propertyName}' property.`);
        }
      }
    });
    return cursor;
  }

  getLinkedSchemas(startingSchema, _cursor, _depth);
  return retVal;
}


if (runningAsScript) {
  const mappingMaker = new MappingMaker();
  mappingMaker.generateMapping(process.argv[2], process.argv[3], process.argv[4]);
} else {
  module.exports = MappingMaker;
}
