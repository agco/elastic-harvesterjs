var Promise = require('bluebird');
var $http = require('http-as-promised');
var _ = require('lodash');

var Sampler = function () {};

Sampler.prototype.checkAndSample = function(es_url, index, type, esQuery, aggregationObjects, query) {
    var params=[];
    
    query['include'] && params.push("include="+ query['include']);
    query['limit'] && params.push("size="+ query['limit']);
    query['offset'] && params.push("from="+ query['offset']);

    var queryStr = '?'+params.join('&');

    var es_resource = es_url + '/' + index + '/' + type + '/_search' + queryStr;

    return Promise.resolve()
    .then(function() {
        // if sampleAggregation make the query to see how many hits we have
        if(query.script === 'sampler') {
            var countUrl = es_url + '/' + index + '/' + type + '/_count' + queryStr;
            var countQuery = _.clone(JSON.parse(esQuery));
        
            delete countQuery.aggs;
            return $http({url : countUrl, method: 'GET', body: JSON.stringify(countQuery)});
        }

    })
    .spread(function(response) {
        if (query.script !== 'sampler') return $http({url : es_resource, method: 'GET', body: esQuery});
        var es_results;
        response && response.body && (es_results = JSON.parse(response.body));
        var total = es_results && es_results.count;
        total = total || 0;
        var maxSamples = parseInt(query['script.maxSamples'], 10);
        var skip_rate = Math.max(0, Math.floor(total/maxSamples) - 1);
        
        var queryParsed = JSON.parse(esQuery);
        queryParsed.size = maxSamples;
        queryParsed.query.filtered.filter = queryParsed.query.filtered.filter || {};
        queryParsed.query.filtered.filter.script = {
            script: "sampler",
            lang: "groovy",
            params : {
                count : -1,
                skip_rate : skip_rate
            }
        };

        //if sample size is same as the total, don't skip anything, just return all
        if (maxSamples >= total) {
            delete queryParsed.query.filtered.filter.script;
        };

        console.log(query)
        return $http({url : es_resource, method: 'GET', body: JSON.stringify(queryParsed)});  
    });
}

module.exports = new Sampler();