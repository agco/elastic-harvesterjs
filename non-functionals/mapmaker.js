var inflect= require('i')();
var _ = require('lodash');

var functionTypeLookup = {
    "function Stri":"string",
    "function Numb": "number",
    "function Bool": "boolean",
    "function Date":"date",
    "function Buff":"buffer",
    "function Arra":"array"
};

function getFunctionType (fn){
    return functionTypeLookup[fn.toString().substr(0,13)];
}

function getMapping(harvest_app,pov){

    var schemaName = inflect.singularize(pov);
    var startingSchema = harvest_app._schema[schemaName];
    var retVal = {};

    function getLinkedSchemas(startingSchema){

        function setValueAndGetLinkedSchemas(propertyName,propertyValue){
            retVal[propertyName]=propertyValue;
            harvest_app._schema[propertyValue] && getLinkedSchemas(harvest_app._schema[propertyValue]);
        }
        _.each(startingSchema,function(property,propertyName){

            if([typeof property]!="function") {
                //if(_.isString(property)) {
                //    setValueAndGetLinkedSchemas(propertyName,property);
                //}else if (_.isArray(property)){
                //    if(_.isString(property[0])){
                //        setValueAndGetLinkedSchemas(propertyName,property[0]);
                //    }else{
                //        setValueAndGetLinkedSchemas(propertyName,property[0].ref);
                //    }
                //}else if (_.isObject(property)){
                //    setValueAndGetLinkedSchemas(propertyName,property.ref);
                //}
            }else{
                var fnType = getFunctionType(property);
                if(fnType==""){

                }
            }
        });
    };

    getLinkedSchemas(startingSchema);
    return retVal;
}

module.exports = {createMapping: getMapping};
