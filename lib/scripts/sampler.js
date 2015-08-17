var Promise = require('bluebird');
var $http = require('http-as-promised');
var _ = require('lodash');

var Sampler = function () {};

Sampler.prototype.sample = function(index, type, esQuery, aggregationObjects, query, es_resource) {
    return Promise.resolve()
    .then(function() {
        // if sampleAggregation make the query to see how many hits we have
        var countUrl = es_resource.replace('/_search', '/_count');
        var countQuery = _.clone(JSON.parse(esQuery));
    
        delete countQuery.aggs;
        delete countQuery.sort;

        return $http({url : countUrl, method: 'GET', body: JSON.stringify(countQuery)});

    })
    .spread(function(response) {
        var es_results;
        response && response.body && (es_results = JSON.parse(response.body));
        var total = es_results && es_results.count;
        total = total || 1;
        var maxSamples = parseInt(query['script.maxSamples'], 10);
        var skip_rate = Math.max(1, Math.floor(total/maxSamples) - 1);
        var queryParsed = JSON.parse(esQuery);

        queryParsed.size = maxSamples;
        queryParsed.query.filtered.filter = queryParsed.query.filtered.filter || {};

        if (queryParsed.query.filtered.filter.and) {
            queryParsed.query.filtered.filter.and.unshift({
                script : {
                    script: 'count=count+1;if(count % skip_rate == 0){ return 1 }; return 0;',
                    lang: 'groovy',
                    params : {
                        count : -1,
                        skip_rate : skip_rate
                    }
                }
            });
        } else {
            queryParsed.query.filtered.filter.script = {
                script: 'count=count+1;if(count % skip_rate == 0){ return 1 }; return 0;',
                lang: 'groovy',
                params : {
                    count : -1,
                    skip_rate : skip_rate
                }
            };
        }

        //if sample size is same as the total, don't skip anything, just return all
        if (maxSamples >= total) {
            delete queryParsed.query.filtered.filter.script;
        };

        return $http({url : es_resource, method: 'GET', body: JSON.stringify(queryParsed)})
    })
    .catch(function(err) {
        console.log(err)
    });
}

module.exports = new Sampler();