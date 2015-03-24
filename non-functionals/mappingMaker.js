var inflect= require('i')();
var _ = require('lodash');
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require("fs"));
var options = {
    adapter: 'mongodb',
    connectionString: "mongodb://127.0.0.1:27017/testDB",
    db: 'testDB',
    inflect: true
};
console.log(JSON.stringify(options));
var runningAsScript = !module.parent;

/*
 *** Elastic-Search mapping maker. ***
 * -------------------------------- *
 Generate scaffolded elastic-search mapping from a harvester app.
 Meant to be run @cmd line, but can also be required and used in code.

 #Usage: node mappingMaker.js path-to-harvester-app primary-es-graph-resource(e.g. people) file-to-create.json
 NB: argv[3] (in this case, "file-to-create.json") is optional. If not specified, no file will be written to disk; instead the mapping will
 be console.logged.
 */

var functionTypeLookup = {
    "function Stri":"string",
    "function Numb":"number",
    "function Bool":"boolean",
    "function Date":"date",
    "function Buff":"buffer",
    "function Arra":"array"
};

function getFunctionType (fn){
    return functionTypeLookup[fn.toString().substr(0,13)];
}

function MappingMaker(){

}


MappingMaker.prototype.generateMapping=function(harvest_app,pov,outputFile){
    if(_.isString(harvest_app)){
        harvest_app = require(harvest_app)(options);
    }else{
        harvest_app = Promise.resolve(harvest_app);
    }
    return harvest_app
        .catch() //harvest_app doesn't have to work perfectly; we just need its schemas.
        .then(function(harvest_app){
            return make(harvest_app,pov);
        })
        .then(function(mappingData){
            if(outputFile){
                console.log('Saving mapping to '+outputFile);
                return fs.writeFileAsync(outputFile,JSON.stringify(mappingData, null, 4)).then(function () {
                    console.log('Saved.');

                    return mappingData;
                }).error(function (e) {
                    console.error("Unable to save file, because: ", e.message);
                });
            }else{
                console.log('Generated Mapping: ');
                console.log(JSON.stringify(mappingData,null,4));
                return mappingData;
            }
        })
};

function make(harvest_app,pov){

    var schemaName = inflect.singularize(pov);
    var startingSchema = harvest_app._schema[schemaName];

    var maxDepth=3;
    var depth=0;

    var retVal = {};
    retVal[pov]={"properties":{}};
    var cursor=retVal[pov]["properties"];

    function getNextLevelSchema(propertyName,propertyValue,cursor,depth) {
        var nextCursor;

        if (depth == 1) {
            cursor["links"] = cursor["links"] || {"type": "nested"};
            cursor["links"]["properties"] = cursor["links"]["properties"] || {};
            cursor["links"]["properties"][propertyName] = {
                "type": "nested",
                "properties": {}
            };
            nextCursor = cursor["links"]["properties"][propertyName]["properties"];
        }else {
            if(depth==maxDepth){
                return;
            }
            cursor[propertyName]={
                "type":"nested",
                "properties":{}
            };
            nextCursor = cursor[propertyName]["properties"];
        }
        harvest_app._schema[propertyValue] && getLinkedSchemas(harvest_app._schema[propertyValue],nextCursor,depth);
    }

    function getLinkedSchemas(startingSchema,cursor,depth){
        if (depth>=maxDepth){
            console.warn("[Elastic-harvest] Graph depth of "+depth+" exceeds "+maxDepth+". Graph dive halted prematurely - please investigate.");//harvest schema may have circular references.
            return;
        }

        depth++;

        _.each(startingSchema,function(propertyValue,propertyName){
            if(typeof propertyValue!="function") {
                if(_.isString(propertyValue)) {
                    getNextLevelSchema(propertyName,propertyValue,cursor,depth);
                }else if (_.isArray(propertyValue)){
                    if(_.isString(propertyValue[0])){
                        getNextLevelSchema(propertyName,propertyValue[0],cursor,depth);
                    }else{
                        getNextLevelSchema(propertyName,propertyValue[0].ref,cursor,depth);
                    }
                }else if (_.isObject(propertyValue)){
                    getNextLevelSchema(propertyName,propertyValue.ref,cursor,depth);
                }

            }else{
                var fnType = getFunctionType(propertyValue);
                if(fnType=="string"){
                    cursor[propertyName]={
                        "type":"string",
                        "index": "not_analyzed"
                    }
                } else if(fnType=="number"){
                    cursor[propertyName]={
                        "type":"long"
                    }
                } else if(fnType=="date"){
                    cursor[propertyName]={
                        "type": "date",
                        "format": "HH:mm"
                    }
                } else if(fnType=="boolean"){
                    cursor[propertyName]={
                        "type": "boolean"
                    }
                } else if(fnType=="array"){
                    console.warn("[mapping-maker] Array-type scaffolding not yet implemented; The elastic-search mapping scaffolded for this app will be incomplete wrt '"+propertyName+"' property.");
                } else if(fnType=="buffer"){
                    console.warn("[mapping-maker] Buffer-type scaffolding not yet implemented; The elastic-search mapping scaffolded for this app will be incomplete.");
                }else{
                    console.warn("[mapping-maker] unsupported type; The elastic-search mapping scaffolded for this app will be incomplete.");
                }
            }
        });
        return cursor;
    };

    getLinkedSchemas(startingSchema,cursor,depth);
    return retVal;
}


if(runningAsScript){
    var mappingMaker = new MappingMaker();
    mappingMaker.generateMapping(process.argv[2], process.argv[3], process.argv[4]);
}else{
    module.exports=MappingMaker;
}