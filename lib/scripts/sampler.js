'use strict';

const Promise = require('bluebird');
const $http = require('http-as-promised');
const _ = require('lodash');

const Sampler = function Sampler() {};

Sampler.prototype.sample = function sample(index, type, esQuery, aggregationObjects, query, esResource) {
  return Promise.resolve()
    .then(() => {
      // if sampleAggregation make the query to see how many hits we have
      const countUrl = esResource.replace('/_search', '/_count');
      const countQuery = _.clone(JSON.parse(esQuery));

      delete countQuery.aggs;
      delete countQuery.sort;

      return $http({ url: countUrl, method: 'GET', body: JSON.stringify(countQuery) });
    })
    .spread((response) => {
      let esResults;
      response && response.body && (esResults = JSON.parse(response.body));
      let total = esResults && esResults.count;
      total = total || 1;
      const maxSamples = parseInt(query['script.maxSamples'], 10);
      const skipRate = Math.max(1, Math.floor(total / maxSamples) - 1);
      const queryParsed = JSON.parse(esQuery);

      queryParsed.size = maxSamples;
      queryParsed.query.filtered.filter = queryParsed.query.filtered.filter || {};

      const script = {
        script: 'count=count+1;if(count % skipRate == 0){ return 1 }; return 0;',
        lang: 'groovy',
        params: {
          count: -1,
          skipRate
        }
      };

      if (queryParsed.query.filtered.filter.and) {
        queryParsed.query.filtered.filter.and.unshift({ script });
      } else {
        queryParsed.query.filtered.filter.script = script;
      }

      // if sample size is same as the total, don't skip anything, just return all
      if (maxSamples >= total) {
        delete queryParsed.query.filtered.filter.script;
      }

      return $http({ url: esResource, method: 'GET', body: JSON.stringify(queryParsed) });
    })
    .catch((err) => {
      console.log(err);
    });
};

module.exports = new Sampler();
