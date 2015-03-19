var Promise = require('bluebird');
var _ = require('lodash');
var _s = require('underscore.string');
var $http = require('http-as-promised');
var ElasticHarvester = require("../elastic-harvester");

var permittedOptions = ["get","add","delete","update"];
var runningAsScript = !module.parent;

/*

*** Elastic-Search mapping helper. ***
* -------------------------------- *
Get, add, delete, and update elastic-search mappings.
Meant to be run @cmd line, but can also be required and used in code.


ADD
#Usage: node mapper.js add http://localhost:9200 dealer-api dealers path-to-new-mapping-json

GET
#Usage: node mapper.js get http://localhost:9200 dealer-api

UPDATE (destructive, causes data loss to entire index)
#Usage: node mapper.js update http://localhost:9200 dealer-api dealers path-to-new-mapping-json

DELETE (destructive)
#Usage: node mapper.js delete http://localhost:9200 dealer-api
 */

function Mapper(option,esUrl,esIndex,mappingType,mappingFile,harvesterApp){
    this.option = option || process.env.OPTION;
    this.esUrl = esUrl || process.env.ES_URL;
    this.esIndex = esIndex  || process.env.ES_INDEX;
    this.mappingType = mappingType || process.env.MAPPING_TYPE;
    this.mappingFile = mappingFile || process.env.ES_MAPPING;
    this.es = new ElasticHarvester(harvesterApp,this.esUrl,this.esIndex,this.mappingType);

    if(!_.contains(permittedOptions,this.option)){
        throw new Error("Option '"+this.option+"' is not in the list of permitted options: ("+ permittedOptions.join(",")+")");
    }
}

Mapper.prototype.update= function(){
    console.log("Updating elastic-search mapping.");
    console.warn("Note that this will cause data loss.");
    var _this=this;
    return this.es.deleteIndex()
        .then(function(resp){
            console.log(resp);
            return _this.es.initializeMapping(getMapping(_this.mappingFile))
        }).then(function(resp){
            console.log(resp);
        })
};

Mapper.prototype.delete= function(){
    console.log("Deleting elastic-search mapping.");
    return $http.del(this.esUrl+'/'+this.esIndex+'/'+this.mappingType+'/_mapping',{json:{}})
        .spread(function(res,body){
            console.log(JSON.stringify(body,null,4));
        })
        .catch(function(e){
            console.warn(e);
        });
};

Mapper.prototype.get= function(){
    console.log("Getting elastic-search mapping.");
    return $http.get(this.esUrl+'/'+this.esIndex+'/_mapping',{json:{}})
        .spread(function(res,body){
            console.log(JSON.stringify(body,null,4));
        })
        .catch(function(e){
            console.warn(e);
        });
};

function getMapping(mappingFile){

    var mapping;
    if(mappingFile==undefined){
        throw new Error("Please specify a mapping file to add")
    }
    try{
        mapping = require(mappingFile);
    }catch(e){
        if (_s.startsWith(e.message,"Cannot find module")){
            throw new Error("Couldn't find your mapping file on disk.");
        }else {
            throw e;
        }
    }
    return mapping;
}


Mapper.prototype.add= function(){
    console.log("Adding elastic-search mapping.");
    return this.es.initializeMapping(getMapping(this.mappingFile))
        .then(function(resp){
            console.log(resp);
        })
};

if(runningAsScript){
    var mapper = new Mapper( process.argv[2], process.argv[3], process.argv[4], process.argv[5], process.argv[6]);
    mapper[mapper.option]();
}else{
    module.exports=Mapper;
}

