//allows you to set a nested property using . notation.
var _ = require('lodash');

function setProperty(obj,field,val){

    var nestedPath = field.split('.');
    var traversedObj = obj;
    _.each(nestedPath,function(pathPart,i){
        if(i<nestedPath.length-1) {
            if(!traversedObj[pathPart]){
                traversedObj[pathPart] = {};
            }
            traversedObj = traversedObj[pathPart];
        }else{
            traversedObj[pathPart]=val;
        }
    });
    return obj;
}

//Use . notation to get a property of an objec t, e.g. "links.name"->{"links":{"name":"val"}}
function getProperty(object, propertyName ) {
    var parts = propertyName.split( "." );
    var length = parts.length;
    var property = object;

    for (var i = 0; i < length; i++ ) {
        if (property == undefined  || property==null)
            return property;
        property = property[parts[i]];
    }

    return property;
}

var convertToString = function(object){
    if(object==undefined||object==null){
        return object;
    }
    else if (_.isString(object))
        return object;
    else if(object.toString)
        return object.toString();
    else if(_.isObject(object))
        return JSON.stringify(object);
    else
        return ""+object;
};

//returns a function that tells you if two objects match on specific parameters, which are speficied in the initial call to match.
//e.g.     var sameAddress = match(["address1","city","links.address_state_province","links.address_country","zip"]);
// sameAddress(dealer,updatedDealer) //returns true or false
var match = function(paramsToMatch){
    return  function(obj1,obj2){
        return paramsToMatch.every(function(paramToMatch){
            return convertToString(getProperty(obj1,paramToMatch))==convertToString(getProperty(obj2,paramToMatch));
        });
    };
};

function includeFields(obj,fields){
    //fastest way is actually to just copy req'd fields;
    var newObj = {};
    _.each(fields,function(field){
        var val = getProperty(obj,field);
        if(!_.isUndefined(val) && !_.isNull(val)){
            setProperty(newObj,field,val);
        }
    })
    return newObj;
}

//Throws error if objValue is undefined
function assertAsDefined(obj,errorMsg){
    if(_.isUndefined(obj) || _.isNull(obj)){
        throw new Error(errorMsg);
    }
}
function toObjectLookup(array){
    var retVal = {};
    _.each(array,function(element){
        retVal[element]=true;
    });
    return retVal;
}

//Returns true if string a dot in it at any position other than the first and last ones.
function hasDotNesting(string) {
    var loc = string.indexOf(".");
    return  (loc!= -1) && (loc!=0) && (loc!=string.length-1);
}

function isDefinedAndNotNull(val) {
    return (!_.isUndefined(val) && !_.isNull(val))
}

//Returns value if it's defined and not null, otherwise returns default;
function getValueWithDefault(value,_default){
    if(isDefinedAndNotNull(value)){return value}
    return _default;
}

//Takes a string like "links.equipment.id",2,"." and returns "id"
function substrAtNthOccurence(string,start,delimiter){
    var delimiter = getValueWithDefault(delimiter,"."),
        start = getValueWithDefault(start,1),
        tokens = string.split(delimiter).slice(start);
    return tokens.join(delimiter);
}

module.exports.hasDotNesting = hasDotNesting;
module.exports.toObjectLookup = toObjectLookup;
module.exports.assertAsDefined = assertAsDefined;
module.exports.getProperty = getProperty;
module.exports.setProperty = setProperty;
module.exports.match = match;
module.exports.includeFields = includeFields;

