var Promise = require('bluebird');
var _ = require('lodash');
var uri = process.argv[2];
var type = process.argv[3] || uri.substr(uri.lastIndexOf('/')+1,uri.length);
var request = Promise.promisify(require('request'));
var headers = {'content-type': 'application/vnd.api+json'};

var MAX_ENTITIES_TO_PROCESS = 10000;

/*
   This little tool reloads the search-providing endpoint, which is useful for reloading/populating your search index.

   Usage: node reload.js http://localhost:8081/dealers "dealers"

   argv[3] (in this case, "dealers") is optional. If not specified, defaults to the part of the url after the last "/".
 */

var do_request = function (path, method, body) {
    return Promise.resolve()
        .then(function () {
            var body_serialized = JSON.stringify(body);
            return request({uri: (path.indexOf("http")!=0)?(uri + path):path, headers: headers, method: method, body: body_serialized})
        });
};

var getEntities =  function(){
    return do_request(uri+"?limit="+MAX_ENTITIES_TO_PROCESS, "GET", {}).then(function(response){
       return JSON.parse(response[0].body);
    });
}

var logEntities = function(entities){
    console.log(JSON.stringify(_.map(entities[type]||[],function(model){
        return model.id;
    })));
}
var massUpdate = function(entities){
    var promises = _.map(entities[type]||[],function(model){
        var putBody={};
        putBody[type]=[model];
        return do_request(uri+"/"+model.id, "PUT", putBody).then(function(result){
            var body = JSON.parse(result[0].body);
            if(body.error){
                console.warn(JSON.stringify(body));
                return body;
            }else{
                console.log(JSON.stringify(body[type][0]));
                return body[type][0];
            }
        },function(err){
            console.warn("Error");
            console.warn(err);
        });
    });
    return Promise.all(promises);
};

Promise.resolve()
    .then(function () {
        console.log('get entities');
        return getEntities();
    })
    .then(function (entities) {
        logEntities(entities);
        console.log('Triggering re-index of entities:');
        return massUpdate(entities);
    })
    .then(function (results) {
        process.exit(0);
    })


