var Promise = require('bluebird');
var _ = require('lodash');
var type = process.argv[3] ;
var $http = require('http-as-promised');
var runningAsScript = !module.parent;

var MAX_ENTITIES_TO_PROCESS = 120000;
var PAGE_SIZE = 10000;
var http = require('http');
var postPool = new http.Agent();
postPool.maxSockets = 5;

var promiseWhile = function(condition, action) {
    var resolver = Promise.defer();

    var loop = function() {
        if (!condition()) return resolver.resolve();
        return action()
            .then(loop)
            .catch(resolver.reject);
    };

    process.nextTick(loop);

    return resolver.promise;
};


/*
 *** Elastic-Search index reloader. ***
 * -------------------------------- *
 Reload elastic-search index from a syncronized mongo-powered harvester endpoint.
 Meant to be run @cmd line, but can also be required and used in code.

 #Usage: node reloader.js http://localhost:8081/dealers "dealers"
   NB: argv[3] (in this case, "dealers") is optional. If not specified, defaults to the part of the url after the last "/".
 */


function Reloader(primarySyncedEndpoint,type,maxSockets){
    this.uri=primarySyncedEndpoint;
    this.type=type || this.uri.substr(this.uri.lastIndexOf('/')+1,this.uri.length);
    postPool.maxSockets=maxSockets || postPool.maxSockets;
}

Reloader.prototype.reload = function(){
    var _this = this;
    return _this.massGet(MAX_ENTITIES_TO_PROCESS)
        .then(function (entities) {
            if(entities[_this.type].length==MAX_ENTITIES_TO_PROCESS){
                throw new Error("This server has >"+MAX_ENTITIES_TO_PROCESS+" entities - please increase MAX_ENTITIES_TO_PROCESS if you want to continue.")
            }else{
                console.log('Retrieved '+entities[_this.type].length+' entities.');
            }
            logEntities(entities,_this.type);
            return _this.massUpdate(entities);
        });
};

// Reloads in batches so that we can work with very large data sets.
Reloader.prototype.pagedReload = function(){
    var lastPageSize,
        offset = 0,
        reloaderThis = this;

    return promiseWhile(countIsNotZero, getBatch);

    function countIsNotZero() {
        return lastPageSize !== 0;
    }

    function getBatch() {
        return reloaderThis.massGet(PAGE_SIZE, offset)
            .then(function(body) {
                var entities = bo1dy[reloaderThis.type];

                lastPageSize = entities.length;
                offset += PAGE_SIZE;
                console.log('OFFSET', offset);
                logEntities(body, reloaderThis.type);
                return reloaderThis.massUpdate(body);
            });
    }
};

Reloader.prototype.massGet =  function(limit, offset){
    console.log('Getting entities');
    return $http.get(this.uri+"?limit="+limit+"&offset="+offset,
        {json:{},pool:postPool})
        .spread(function(res,body){
            return body;
        })
        .catch(function(e){
            console.warn(e);
        });
};

var logEntities = function(entities,type){
    console.log(JSON.stringify(_.map(entities[type]||[],function(model){
        return model.id;
    })));
};

Reloader.prototype.massUpdate = function(entities){
    var _this=this;
    console.log('Triggering re-index of entities:');
    var promises = _.map(entities[_this.type]||[],function(model){
        var putBody={};
        var id = model.id;
        delete model.id;
        putBody[_this.type]=[model];

        return $http.put(_this.uri+"/"+id,{json:putBody,pool:postPool})
            .spread(function(res,body){
                if(body.error){
                    console.warn(JSON.stringify(body));
                    return body;
                }else{
                    console.log(JSON.stringify(body[_this.type][0]));
                    return body[_this.type][0];
                }
            })
            .catch(function(e){
                console.warn(e);
            });
    });
    return Promise.all(promises);
};


if(runningAsScript){
    var reloader = new Reloader(process.argv[2],process.argv[3]);
    reloader.pagedReload();
}else{
    module.exports=Reloader;
}
