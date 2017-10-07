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
const runningAsScript = !module.parent;

/*
 *** Elastic-Search autoUpdateInputGenerator. ***
 * -------------------------------- *
 Generate elastic-search autoUpdateInput from a harvester app.
 Meant to be run @cmd line, but can also be required and used in code.

 #Usage: node autoIndexInputGenerator.js path-to-harvester-app primary-es-graph-resource(e.g. people)
 file-to-create.json
 NB: argv[3] (in this case, "file-to-create.json") is optional. If not specified, no file will be written to disk;
 instead the mapping will
 be console.logged.
 */


function InputGenerator() {
}


InputGenerator.prototype.generateInput = function generateInput(harvestApp, pov, outputFile) {
  const _this = this;
  const _harvesterApp = (_.isString(harvestApp)) ? require(harvestApp)(options) : Promise.resolve(harvestApp);

  return _harvesterApp
    .catch() // harvestApp doesn't have to work perfectly; we just need its schemas.
    .then((harvesterApp) => {
      return _this.make(harvesterApp, pov);
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

InputGenerator.prototype.make = function make(harvestApp, pov) {
  const schemaName = inflect.singularize(pov);
  const _startingSchema = harvestApp._schema[schemaName];

  const maxDepth = 3;
  const _depth = 0;

  const retVal = {};

  const _path = 'links';

  function getNextLevelSchema(propertyName, propertyValue, path, depth) {
    if (depth === maxDepth) {
      return;
    }
    retVal[`${path}.id`] = propertyValue;
    harvestApp._schema[propertyValue] && getLinkedSchemas(harvestApp._schema[propertyValue], path, depth);
  }

  function getLinkedSchemas(startingSchema, path, depth) {
    let newPath;
    if (depth >= maxDepth) {
      console.warn(`[Elastic-harvest] Graph depth of ${depth} exceeds ${maxDepth}. Graph dive halted prematurely ` +
      '- please investigate.'); // harvest schema may have circular references.
      return '';
    }

    depth++; // eslint-disable-line no-param-reassign
    _.each(startingSchema, (propertyValue, propertyName) => {
      newPath = `${path}.${propertyName}`;
      if (typeof propertyValue !== 'function') {
        if (_.isString(propertyValue)) {
          getNextLevelSchema(propertyName, propertyValue, newPath, depth);
        } else if (_.isArray(propertyValue)) {
          if (_.isString(propertyValue[0])) {
            getNextLevelSchema(propertyName, propertyValue[0], newPath, depth);
          } else {
            getNextLevelSchema(propertyName, propertyValue[0].ref, newPath, depth);
          }
        } else if (_.isObject(propertyValue)) {
          getNextLevelSchema(propertyName, propertyValue.ref, newPath, depth);
        }
      }
    });
    return path;
  }

  getLinkedSchemas(_startingSchema, _path, _depth);
  return retVal;
};


if (runningAsScript) {
  const inputGenerator = new InputGenerator();
  inputGenerator.generateInput(process.argv[2], process.argv[3], process.argv[4]);
} else {
  module.exports = InputGenerator;
}
