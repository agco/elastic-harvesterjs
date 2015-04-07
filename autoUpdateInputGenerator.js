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
var runningAsScript = !module.parent;

/*
 *** Elastic-Search autoUpdateInputGenerator. ***
 * -------------------------------- *
 Generate elastic-search autoUpdateInput from a harvester app.
 Meant to be run @cmd line, but can also be required and used in code.

 #Usage: node autoIndexInputGenerator.js path-to-harvester-app primary-es-graph-resource(e.g. people) file-to-create.json
 NB: argv[3] (in this case, "file-to-create.json") is optional. If not specified, no file will be written to disk; instead the mapping will
 be console.logged.
 */


function InputGenerator(){
}


InputGenerator.prototype.generateInput=function(harvest_app,pov,outputFile){
    var _this=this;
    if(_.isString(harvest_app)){
        harvest_app = require(harvest_app)(options);
    }else{
        harvest_app = Promise.resolve(harvest_app);
    }
    return harvest_app
        .catch() //harvest_app doesn't have to work perfectly; we just need its schemas.
        .then(function(harvest_app){
            return _this.make(harvest_app,pov);
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

InputGenerator.prototype.make = function(harvest_app,pov){

    var schemaName = inflect.singularize(pov);
    var startingSchema = harvest_app._schema[schemaName];

    var maxDepth=3;
    var depth=0;

    var retVal = {};

    var path ="links";

    function getNextLevelSchema(propertyName,propertyValue,path,depth) {
        console.log('path',path+".id");
            if(depth==maxDepth){
                return;
            }
        retVal[path+".id"]=propertyValue;
        harvest_app._schema[propertyValue] && getLinkedSchemas(harvest_app._schema[propertyValue],path,depth);
    }

    function getLinkedSchemas(startingSchema,path,depth){
        var newPath;
        if (depth>=maxDepth){
            console.warn("[Elastic-harvest] Graph depth of "+depth+" exceeds "+maxDepth+". Graph dive halted prematurely - please investigate.");//harvest schema may have circular references.
            return;
        }

        depth++;
        _.each(startingSchema,function(propertyValue,propertyName){
            newPath=path+"."+propertyName;
            if(typeof propertyValue!="function") {
                if(_.isString(propertyValue)) {
                    getNextLevelSchema(propertyName,propertyValue,newPath,depth);
                }else if (_.isArray(propertyValue)){
                    if(_.isString(propertyValue[0])){
                        getNextLevelSchema(propertyName,propertyValue[0],newPath,depth);
                    }else{
                        getNextLevelSchema(propertyName,propertyValue[0].ref,newPath,depth);
                    }
                }else if (_.isObject(propertyValue)){
                    getNextLevelSchema(propertyName,propertyValue.ref,newPath,depth);
                }

            }
        });
        return path;
    };

    getLinkedSchemas(startingSchema,path,depth);
    return retVal;
};


if(runningAsScript){
    var inputGenerator = new InputGenerator();
    inputGenerator.generateInput(process.argv[2], process.argv[3], process.argv[4]);
}else{
    module.exports=InputGenerator;
}