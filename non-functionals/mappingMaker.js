var inflect= require('i')();
var _ = require('lodash');
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require("fs"));
var defaultConfig  = require('./../test/config');
var options = defaultConfig.options;

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


function getMapping(harvest_app,pov,outputFile){
    if(_.isString(harvest_app)){
        harvest_app = require(harvest_app)(options);
    }else{
        harvest_app = Promise.resolve(harvest_app);
    }
    return harvest_app
        .then(function(harvest_app){
            return generateMapping(harvest_app,pov);
        })
        .then(function(mappingData){
            if(outputFile){
                return fs.writeFileAsync(outputFile,JSON.stringify(mappingData)).then(function () {
                    return mappingData;
                }).error(function (e) {
                    console.error("unable to write file, because: ", e.message);
                });
            }else{
                return mappingData;
            }
        })
}

function generateMapping(harvest_app,pov){

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
                    console.warn("[elastic-harvest] Array-type scaffolding not yet implemented; The elastic-search mapping scaffolded for this app will be incomplete.")
                } else if(fnType=="buffer"){
                    console.warn("[elastic-harvest] Buffer-type scaffolding not yet implemented; The elastic-search mapping scaffolded for this app will be incomplete.")
                }
            }
        });
        return cursor;
    };

    getLinkedSchemas(startingSchema,cursor,depth);
    return retVal;
}

module.exports = {createMapping: getMapping};
