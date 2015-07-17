var Promise = require('bluebird');
var $http = require('http-as-promised');

var Sampler = function () {

};

Sampler.prototype.checkAndSample = function(es_url, index, type, esQuery, aggregationObjects, query) {
    var sampleAggregation;

    aggregationObjects.forEach(function(aggObject, index) {
        if(aggObject.type === 'sample') {
            sampleAggregation = aggObject;
            aggregationObjects.splice(index, 1);
        }
    });

    var params=[];
    
    query['include'] && params.push("include="+ query['include']);
    query['limit'] && params.push("size="+ query['limit']);
    query['offset'] && params.push("from="+ query['offset']);

    var queryStr = '?'+params.join('&');

    var es_resource = es_url + '/' + index + '/' + type + '/_search' + queryStr;

    return Promise.resolve()
    .then(function() {
        // if sampleAggregation make the query to see how many hits we have
        if(sampleAggregation) {
            var countUrl = es_url + '/' + index + '/' + type + '/_count' + queryStr;
            var countQuery = _.clone(JSON.parse(esQuery));
        
            delete countQuery.aggs;
            return $http({url : countUrl, method: 'GET', body: JSON.stringify(countQuery)});
        }

    })
    .spread(function(response) {
        if (!sampleAggregation) return $http({url : es_resource, method: 'GET', body: esQuery});
        var es_results;
        response && response.body && (es_results = JSON.parse(response.body));
        var total = es_results && es_results.count;
        total = total || 0;
        sampleAggregation.maxSamples = parseInt(sampleAggregation.maxSamples, 10);
        var skip_rate = Math.max(0, Math.floor(total/sampleAggregation.maxSamples) - 1);
        
        var query = JSON.parse(esQuery);
        query.size = sampleAggregation.maxSamples;
        query.query.filtered.filter = query.query.filtered.filter || {};
        query.query.filtered.filter.script = {
            script: "sampler",
            lang: "groovy",
            params : {
                count : -1,
                skip_rate : skip_rate
            }
        };

        //if sample size is same as the total, don't skip anything, just return all
        if (sampleAggregation.maxSamples >= total) {
            delete query.query.filtered.filter.script;
        };

        return $http({url : es_resource, method: 'GET', body: JSON.stringify(query)});  
    });
}

module.exports = new Sampler();