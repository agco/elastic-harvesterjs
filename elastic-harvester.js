var ObjectId = require('mongoose').Types.ObjectId;
var request = require('request');
var bluebird = require('bluebird');
var requestAsync = bluebird.promisify(require('request'));

var _s = require('underscore.string');
var inflect= require('i')();
var _ = require('lodash');
var RSVP = require('rsvp');
var Util =  require("./Util");

//Bonsai wants us to only send 1 ES query at a time, for POSTs/PUTs. Later on we can add more pools for other requests if needed.
var http = require('http');
var postPool = new http.Agent();
postPool.maxSockets = 1;

var DEFAULT_AGGREGATION_LIMIT = 0;//0=>Integer.MAX_VALUE
var DEFAULT_TOP_HITS_AGGREGATION_LIMIT = 10; //Cannot be zero. NOTE: Default number of responses in top_hit aggregation is 10.
var DEFAULT_SIMPLE_SEARCH_LIMIT = 1000; //simple searches don't specify a limit, and are only used internally for autoupdating
var defaultOptions = {
   graphDepth:{
       default:3
   }
};
function ElasticHarvest(harvest_app,es_url,index,type,options) {
    var _this= this;
    if(harvest_app){
        this.collectionLookup=getCollectionLookup(harvest_app,type);
        this.adapter = harvest_app.adapter;
        this.harvest_app = harvest_app;
    }else{
        console.warn("[Elastic-Harvest] Using elastic-harvester without a harvest-app. Functionality will be limited.");
    }
    this.es_url=es_url;
    this.index=index;
    this.type = type;
    this.options = _.merge(defaultOptions,options);

    /** SEARCH RELATED **/
    this.route = function (req, res, next){
        var predicates = [];
        var nestedPredicates = [];
        var geoPredicate = {};
        var sortParams = req.query["sort"];
        sortParams && (sortParams = sortParams.split(','));

        var reservedQueryTerms = ["aggregations","aggregations.fields","include","limit","offset","sort","fields"];
        reservedQueryTerms = reservedQueryTerms.concat(getAggregationFields(req.query));
        var reservedQueryTermLookup = Util.toObjectLookup(reservedQueryTerms);

        _.each(req.query, function (value,key) {

            if (_s.startsWith(key, "geo_distance.")) {
                geoPredicate[key.substr(13)]=req.query[key];
                //TODO: return error if geoPredicate distance is not supplied with a unit.
            } else if (!reservedQueryTermLookup[key] && Util.hasDotNesting(key)){
                nestedPredicates.push([key, req.query[key]]);
            }
            else if (!reservedQueryTermLookup[key]){
                predicates.push({key:key,value:req.query[key]});
            }
        });

        nestedPredicates = _.filter(nestedPredicates, function (nestedPredicate) {
            return nestedPredicate.length === 2;
        });

        // Support deprecated "aggregations.fields" aggregation param by converting those params to new query format
        if(req.query["aggregations.fields"]){
            var oldFields = req.query["aggregations.fields"].split(',');
            _.each(oldFields,function(oldfield,i) {
                if (req.query["aggregations"]) {
                    req.query["aggregations"] = req.query["aggregations"] + "," + oldfield;
                } else {
                    req.query["aggregations"] = oldfield;
                }
                req.query[oldfield+".property"]=oldfield;

            });
        }
        var aggregationObjects = getAggregationObjects(req.query);



        var esQuery = _this.getEsQueryBody(predicates, nestedPredicates, geoPredicate,aggregationObjects, sortParams);
        esSearch(esQuery,aggregationObjects,req,res,next);
    };

    var permittedAggOptions = {
        top_hits:["type","sort","limit","fields","include"],
        terms:["type","order","aggregations","property"],
        stats:["type","property"],
        extended_stats:["type","property"]
    };

    function setValueIfExists(obj,property,val,fn){
        (val) && (fn?fn(val,property):true) && (obj[property] = val);
        return obj;
    }

    function assertIsNotArray(val,property){
        if(_.isArray(val)){
            throw new Error ("You can't supply multiple values for '"+ property+"'.");
            return false;
        }
        return true;
    };

    var bannedAggNames = {"key":true,"doc_count":true,"count":true};

    function assertAggNameIsAllowed(aggName,supplimentalBanList){
        if(bannedAggNames[aggName]){
            throw new Error("You're not allowed to use '"+ aggName+"' as an aggregation name.");
        }
        if(supplimentalBanList[aggName]){
            throw new Error("You can't use '"+ aggName+"' as an aggregation name multiple times!");
        }
    }
    //returns an array of all protected aggregationFields
    function getAggregationFields(query,aggParam,supplimentalBanList) {
        var retVal = [];
        !aggParam && (aggParam = "aggregations");
        if(!query[aggParam]){
            return retVal;
        }
        supplimentalBanList=supplimentalBanList || {};

        _.each(query[aggParam].split(','),function(agg){
            assertAggNameIsAllowed(agg,supplimentalBanList);
            supplimentalBanList[agg]=true;
            var type = query[agg +".type"];
            !type && (type ="terms");
            var aggOptions = permittedAggOptions[type];
            _.each(aggOptions,function(aggOption){
                var expectedOptionName = agg+"."+aggOption;
                retVal.push(expectedOptionName);
            });

            if( query[agg+".aggregations"]){
                var nestedAggFields=  getAggregationFields(query,agg+".aggregations",supplimentalBanList);
                retVal=retVal.concat(nestedAggFields);
            }
        });
        return retVal;
    }

    function getAggregationObjects(query,aggParam){
        !aggParam && (aggParam = "aggregations");
        if(!query[aggParam]){
            return [];
        }
        return _.map(query[aggParam].split(','),function(agg){

            var aggregation = {};

            setValueIfExists(aggregation,"name",agg,assertIsNotArray);
            setValueIfExists(aggregation,"property",query[agg+".property"],assertIsNotArray);
            setValueIfExists(aggregation,"type",query[agg+".type"] || "terms",assertIsNotArray);
            setValueIfExists(aggregation,"order",query[agg+".order"],assertIsNotArray);
            setValueIfExists(aggregation,"sort",query[agg+".sort"],assertIsNotArray);
            setValueIfExists(aggregation,"limit",query[agg+".limit"],assertIsNotArray);
            setValueIfExists(aggregation,"fields",query[agg+".fields"],assertIsNotArray);
            setValueIfExists(aggregation,"include",query[agg+".include"],assertIsNotArray);


            if( query[agg+".aggregations"]){//TODO: also, if type allows nesting (aka, type is a bucket aggregation)
                aggregation.aggregations = getAggregationObjects(query,agg+".aggregations");
            }

            return aggregation;
        })
    }

    //HarvestRoute is used to appendLinks & appendLinked.
    this.setHarvestRoute = function(harvestRoute){
        this.harvestRoute = harvestRoute;
    }

    function getSourceObjects(aggResponse){
       return  _.map(aggResponse.hits.hits,function(esReponseObj){
            return esReponseObj["_source"];
        });
    }
    //Note that this is not currently named well - it also provides the "includes" functionality to top_hits.
    function getTopHitsResult(aggResponse,aggName,esResponse,aggregationObjects){

        var aggLookup = {};
        (function getAggLookup(aggLookup,aggregationObjects){
            _.each(aggregationObjects,function(aggObj){
                aggLookup[aggObj.name]=aggObj;
                aggObj.aggregations && getAggLookup(aggLookup,aggObj.aggregations);
            });
        })(aggLookup,aggregationObjects);


        var linked = {}//keeps track of all linked objects. type->id->true
        var typeLookup = {}
        //dedupes already-linked entities.
        if(aggLookup[aggName] && aggLookup[aggName].include) {

            _.each(aggLookup[aggName].include.split(','), function (linkProperty) {
                if (_this.collectionLookup[linkProperty]) {
                    var type = inflect.pluralize(_this.collectionLookup[linkProperty]);
                    typeLookup[linkProperty]=type;

                    esResponse.linked && _.each(esResponse.linked[type]||[],function(resource,collection){
                        linked[type]=linked[type]||{};
                        linked[type][resource.id]=true;
                    })
                }

            });
        }
        return _.map(aggResponse.hits.hits,function(esReponseObj){
            if(aggLookup[aggName] && aggLookup[aggName].include){
                _.each(aggLookup[aggName].include.split(','), function (linkProperty) {
                    if (typeLookup[linkProperty]) {
                        var type = typeLookup[linkProperty];

                        //if this isn't already linked, link it.
                        //TODO: links may be an array of objects, so treat it that way at all times.
                        var hasLinks = !!(esReponseObj._source.links) && !!(esReponseObj._source.links[linkProperty]);
                        if(hasLinks){
                            var entitiesToInclude = [].concat(unexpandSubentity(esReponseObj._source.links[linkProperty]));

                            _.each(entitiesToInclude,function(entityToInclude){
                                var entityIsAlreadyIncluded = !!(linked[type]) && !!(linked[type][entityToInclude.id]);
                                if (!entityIsAlreadyIncluded) {
                                    esResponse.linked = esResponse.linked || {};
                                    esResponse.linked[type] = esResponse.linked[type] || [];

                                    esResponse.linked[type] = esResponse.linked[type].concat(entityToInclude);
                                    linked[type] = linked[type] || {};
                                    linked[type][entityToInclude.id] = true;
                                }
                            })
                        }
                    } else {
                        console.warn("[Elastic-Harvest] "+ linkProperty + " is not in collectionLookup. " + linkProperty + " was either incorrectly specified by the end-user, or dev failed to include the relevant key in the lookup provided to initialize elastic-harvest.");
                    }
                })
            }
            return unexpandEntity(esReponseObj["_source"]);

        });
    }

    function sendSearchResponse(es_results, res, includes,fields,aggregationObjects) {
        var initialPromise = RSVP.resolve();
        var padding = undefined;
        (process.env.NODE_ENV!="production") && (padding = 2);

        return initialPromise.then(function(){
            var esResponseArray = getResponseArrayFromESResults(es_results,fields);
            var esResponse = {};
            esResponse[type]= esResponseArray;

            _this.harvestRoute.appendLinked(esResponse,includes)
                .then(function(esResponse) {

                //Add in meta.aggregations field
                if (es_results && es_results.aggregations) {
                    var createBuckets = function (terms) {
                        return _.map(terms, function (term) {
                            //1. see if there are other terms & if they have buckets.
                            var retVal = {key: term.key, count: term.doc_count};

                            _.each(term,function(aggResponse,responseKey){
                                if(responseKey=="key" || responseKey=="doc_count"){
                                    return;
                                }else if(aggResponse.buckets) {
                                    retVal[responseKey] = createBuckets(aggResponse.buckets);

                                }else if (aggResponse.hits && aggResponse.hits.hits){
                                    //top_hits aggs result from nested query w/o reverse nesting.
                                    retVal[responseKey] = getTopHitsResult(aggResponse,responseKey,esResponse,aggregationObjects);
                                    //to combine nested aggs w others, you have to un-nest them, & this takes up an aggregation-space.
                                }else if (responseKey!="reverse_nesting" && aggResponse){ //stats & extended_stats aggs
                                    //This means it's the result of a nested stats or extended stats query.
                                    if(aggResponse[responseKey]){
                                        retVal[responseKey] = aggResponse[responseKey];
                                    }else{
                                        retVal[responseKey] = aggResponse;
                                    }
                                }

                                else if(responseKey=="reverse_nesting"){
                                    _.each(aggResponse,function(reverseNestedResponseProperty,reverseNestedResponseKey){
                                        if(reverseNestedResponseKey=="doc_count"){
                                            return;
                                        }
                                        else if(reverseNestedResponseProperty.buckets){
                                            retVal[reverseNestedResponseKey] = createBuckets(reverseNestedResponseProperty.buckets);
                                            //this gets a little complicated because reverse-nested then renested subdocuments are .. complicated (because the extra aggs for nesting throws things off).
                                        }else if (reverseNestedResponseProperty[reverseNestedResponseKey] && reverseNestedResponseProperty[reverseNestedResponseKey].buckets){
                                            retVal[reverseNestedResponseKey] = createBuckets(reverseNestedResponseProperty[reverseNestedResponseKey].buckets);

                                            //this gets a little MORE complicated because of reverse-nested then renested top_hits aggs
                                        }else if (reverseNestedResponseProperty.hits && reverseNestedResponseProperty.hits.hits){
                                            retVal[reverseNestedResponseKey] = getTopHitsResult(reverseNestedResponseProperty,reverseNestedResponseKey,esResponse,aggregationObjects);

                                            //stats & extended_stats aggs
                                        }else if (reverseNestedResponseProperty){
                                            //This means it's the result of a nested stats or extended stats query.
                                            if(reverseNestedResponseProperty[reverseNestedResponseKey]){
                                                retVal[reverseNestedResponseKey] = reverseNestedResponseProperty[reverseNestedResponseKey];
                                            }else{
                                                retVal[reverseNestedResponseKey] = reverseNestedResponseProperty;
                                            }
                                        }

                                    });
                                }
                            });
                            return retVal;
                            //Todo: ended day here -> start by recursively turning out term's extra params (e.g. name)'s buckets
                        });
                    };

                    var createAggregations = function (es_results,esResponse,aggregationObjects) {
                        var meta = {
                            aggregations: {
                            }
                        };
                        _.forIn(es_results.aggregations, function (value, key) {
                            if (value["buckets"]){
                                //simple terms agg
                                meta.aggregations[key] = createBuckets(value.buckets);
                            }
                            else if (value[key] && value[key]["buckets"]) {
                                //nested terms agg
                                meta.aggregations[key] = createBuckets(value[key]["buckets"]);
                            } else if (value.hits && value.hits.hits) {
                                //top_hits aggs result from totally un-nested query
                                meta.aggregations[key] = getTopHitsResult(value,key,esResponse,aggregationObjects);
                                //esResponse is what gets retuend so modify linked in that.
                            }else if (value){
                                //stats & extended_stats aggs
                                if(value[key]){
                                    //This means it's the result of a nested stats or extended stats query.
                                    meta.aggregations[key] = value[key];
                                }else{
                                    meta.aggregations[key] = value;
                                }
                            }
                        });
                        return meta;
                    };
                    esResponse.meta = createAggregations(es_results,esResponse,aggregationObjects);
                }

                //Add in meta.geo_distance
                if (es_results && es_results.hits && es_results.hits.hits && es_results.hits.hits[0] && es_results.hits.hits[0].fields && es_results.hits.hits[0].fields.distance) {
                    esResponse.meta = esResponse.meta || {};
                    esResponse.meta.geo_distance = {};
                    _.each(es_results.hits.hits, function (hit) {
                        var distance = hit.fields.distance[0];
                        var objId = hit._id;
                        var type = hit._type;
                        esResponse.meta.geo_distance[type] = esResponse.meta.geo_distance[type] || {};
                        esResponse.meta.geo_distance[type][objId] = distance;
                    });
                }

                    esResponse = _this.harvestRoute.appendLinks(esResponse);

                return res
                    .set('content-type', 'application/vnd.api+json') //todo set jsonapi ct
                    .status(200)
                    .send(JSON.stringify(esResponse,undefined, padding));
            }, function(error){
                    esResponse = _this.harvestRoute.appendLinks(esResponse);

                return res
                    .set('content-type', 'application/vnd.api+json') //todo set jsonapi ct
                    .status(400)
                    .send(JSON.stringify(esResponse,undefined, padding));
            });
        });
    }

    function esSearch(esQuery,aggregationObjects,req,res) {
        var params=[];
        var query=req.query;
        query['include'] && params.push("include="+ query['include']);
        query['limit'] && params.push("size="+ query['limit']);
        query['offset'] && params.push("from="+ query['offset']);

        var queryStr = '?'+params.join('&');

        var es_resource = es_url + '/'+index+'/'+type+'/_search'+queryStr;
        request(es_resource, {method: 'GET', body: esQuery}, function (error, response, body) {
            var es_results;
            body && (es_results = JSON.parse(body));
            if (error || es_results.error) {
                es_results.error && (error=es_results.error);
                console.warn(error);
                throw new Error("Your query was malformed, so it failed. Please check the api to make sure you're using it correctly.");
            } else {
                var includes = req.query["include"],
                    fields = req.query["fields"];
                includes && (includes=includes.split(','));
                fields && (fields=fields.split(','));
                //id field is required.
                fields && fields.push("id");
                return sendSearchResponse(es_results, res,includes,fields,aggregationObjects);
            }
        });
    }

    return this;
}

var requiredAggOptions = {
    top_hits:["type"],
    terms:["type","property"],
    stats:["type","property"],
    extended_stats:["type","property"]
}

function assertAggregationObjectHasRequiredOptions(aggregationObject){
    var type = aggregationObject.type||"terms";
    _.each(requiredAggOptions[type],function(requiredOption){
        Util.assertAsDefined(aggregationObject[requiredOption],type+" aggregations require that a '"+requiredOption+"' paramenter is specified.");
    })
}

var esDistanceFunctionLookup={
    mi:"arcDistanceInMiles",
    miles:"arcDistanceInMiles",
    km:"arcDistanceInKm",
    kilometers:"arcDistanceInKm",
    m: "arcDistance",
    meters:"arcDistance"
}

//Transforms an expanded ES source object to an unexpanded object
function unexpandEntity(sourceObject,includeFields){
    _.each(sourceObject.links || [],function(val,key){
        if(!_.isArray(sourceObject.links[key])){
            //I know the extra .toString seems unnecessary, but sometimes val.id is already an objectId, and other times its a string.
            sourceObject.links[key] = ObjectId(val.id.toString());

        }else{
            _.each(sourceObject.links[key],function(innerVal,innerKey){
                sourceObject.links[key][innerKey] = ObjectId(innerVal.id.toString());
            })
        }
    })
    includeFields && includeFields.length && (sourceObject = Util.includeFields(sourceObject,includeFields));
    return sourceObject;
}

//A sub-entity is a linked object returned by es as part of the source graph. They are expanded differently from primary entities, and must be unexpanded differently as well.
function unexpandSubentity(subEntity){
    if(_.isArray(subEntity)){
        _.each(subEntity,function(entity,index){
            subEntity[index]=unexpandSubentity(entity);
        })
    }else{
        _.each(subEntity,function(val,propertyName){
            if(_.isObject(val) && val.id){
                subEntity["links"] = subEntity["links"] || {};
                subEntity["links"][propertyName]=val.id;
                delete subEntity[propertyName];
            }
        })
    }
    return subEntity;
}

function getResponseArrayFromESResults(results,fields){

    var retVal = [];
    if (results && results.hits && results.hits.hits){
        _.each(results.hits.hits,function(hit){
            retVal.push(unexpandEntity(hit._source,fields));
        })
    }
    return retVal;
}


ElasticHarvest.prototype.getEsQueryBody = function (predicates, nestedPredicates, geoPredicate,aggregationObjects,sortParams) {

    var createEsQueryFragment = function (fields, queryVal) {

        return {
            "query": {
                "query_string": {
                    "fields": [fields],
                    "query": queryVal
                }
            }};
    };


    var operatorMap = {
        "lt":"lt",
        "le":"lte",
        "gt":"gt",
        "ge":"gte"
        };
    var createMatchQueryFragment = function (field,value){
        var fragment;
        //ToDo: add "lenient" to support queries against numerical values.

        //Handle range queries (lt, le, gt, ge) differently.
        if(value.indexOf("=")!=-1){
            var actualValue = value.substr(3);
            var operator = operatorMap[value.substr(0,2)];
            fragment = {"query": {"range": {}}};
            fragment["query"]["range"][field] = {};
            fragment["query"]["range"][field][operator] = actualValue;

        }else if(value.indexOf("*")!=-1){
            fragment = {"query": {"wildcard": {}}};
            fragment["query"]["wildcard"][field] = value;
        }else {
             var val = value.replace(/,/g," ");
             fragment = {"query": {"match": {}}};
             fragment["query"]["match"][field] = {query:val,lenient:true};
        }
        return fragment;
    };
    createEsQueryFragment = createMatchQueryFragment;

    /*-
     * Groups predicates at their lowest match level to simplify creating nested queries
     */
    var groupNestedPredicates = function(nestedPredicates){
        var maxDepth=0;
        var nestedPredicateObj = {};
        var nestedPredicateParts= _.map(nestedPredicates,function(predicateArr){
            var predicate = predicateArr[0];
            var retVal = predicate.split(".");
            nestedPredicateObj[predicate]=predicateArr[1];
            retVal.length>maxDepth && (maxDepth = retVal.length);
            return retVal;
        });
        var groups={};
        for (var i=0;i<maxDepth;i++){
            groups[i]= _.groupBy(nestedPredicateParts,function(predicateParts){
                var retval="";
                for (var j=0;j<i+1;j++) {
                    retval+=(predicateParts[j]?predicateParts[j]+".":"");
                }
                return retval.substr(0,retval.length-1);
            })
        }

        var completed = {};
        var levels = {};
        var paths = {};
        //Simplifies the grouping
        for (var i=maxDepth-1;i>=0;i--) {
            _.each(groups[i],function(values,key){
                _.each(values,function(value){
                    var strKey = value.join('.');
                    if(!completed[strKey] && values.length>1){
                        (!levels[i] && (levels[i]=[]));
                        levels[i].push(strKey);
                        (completed[strKey]=true);
                        paths[i]=key;
                    }
                    if(!completed[strKey] && i<1){
                        (!levels[i] && (levels[i]=[]));
                        levels[i].push(strKey);
                        (completed[strKey]=true);
                        paths[i]=key;
                    }
                });
            });
        }
        return {groups:levels,paths:paths, nestedPredicateObj:nestedPredicateObj};
    };

    var createNestedPredicateFragment = function(grouping){
        var basicQuery = _.map(grouping.groups,function(group,index){
            //add basic terms, then for each predicate in the level group add extra terms.
            var path = grouping.paths[index];
            var qObj =
            {
                "nested": {
                    "path": path,
                    "query": {
                        "bool": {
                            "must": []
                        }
                    }
                }
            };

            _.each(group,function(groupling){
                var value = grouping.nestedPredicateObj[groupling];
                var key = groupling;
                var localPath = groupling.substr(0, groupling.lastIndexOf("."));

                var matchObj=createEsQueryFragment(key,value)["query"];

                if(localPath == path){
                    qObj.nested.query.bool.must.push(matchObj);
                }else{
                    qObj.nested.query.bool.must.push({
                        "nested": {
                            "path" : localPath,
                            "query": matchObj
                        }
                    });
                }
            });
            return qObj;
        });

        var isExpandableQuery = function(basicQuery){
            var retVal = false;
            _.each(basicQuery,function(query) {
                retVal = retVal || isAlongExpandableQueryLine(query);
            })
            return retVal;
        }

        var isAlongExpandableQueryLine = function(query){
            var retVal = false;
            _.each(query.nested.query.bool.must, function (innerQuery, mustI) {
                var matchObj = innerQuery.match|| innerQuery.nested.query.match;
                var values = _.values(matchObj);
                if (_.isArray(values[0])) {
                    retVal = true;
                }
            })
            return retVal;
        }

        //Handles the case where multiple values are submitted for one key
        //This transforms a query that tries to match something like {match:{links.husband.name:["Peter","Solomon"]} to one that
        //instead duplicates all parts of the query and splits it so each match term has it's own search query. This was done so
        //searches would not be unduely limited by the nested level.
        var getExpandedQuery = function(basicQuery){
            var expandedQuery = [];
            var needsExpandedQuery = isExpandableQuery(basicQuery);
            if(!needsExpandedQuery){
                expandedQuery = basicQuery;
            }else{
                _.each(basicQuery,function(query,i){
                    var thisNonExpandableQueryWasAlreadyCloned=false;
                    var isExpandableQueryLine = isAlongExpandableQueryLine(query);
                    _.each(query.nested.query.bool.must,function(innerQuery,mustI){
                        var matchObj = innerQuery.nested.query.match;
                        var values = _.values(matchObj);
                        if(values.length>1){
                            console.warn("[Elastic-Harvest] Our match query isn't supposed to have multiple keys in it. We expect something like {match:{name:'Peter'}}, and you've constructed a match like {match:{name:'Peter',type:'person'}}");
                            throw Error("The query expansion algorithm does not expect this query form.")
                        }
                        if(_.isArray(values[0])){
                            _.each(values[0],function(value){
                                var key = _.keys(matchObj)[0];
                                var newQuery = _.cloneDeep(basicQuery);
                                var relatedMatchObj = newQuery[i].nested.query.bool.must[mustI].nested.query.match;
                                relatedMatchObj[key]=value;
                                expandedQuery.push(newQuery[i]);
                            });
                        }else if (!isExpandableQueryLine && !thisNonExpandableQueryWasAlreadyCloned){
                            //the only queries that get cloned are the ones on the query line of the expanded query.
                            expandedQuery.push(basicQuery[i]);
                            thisNonExpandableQueryWasAlreadyCloned = true;
                        }
                    })
                });
            }

            return expandedQuery;
        };

        var expandedQuery = getExpandedQuery(basicQuery);
        if(expandedQuery==basicQuery){
            return expandedQuery;
        }else if (isExpandableQuery(expandedQuery)){
            return getExpandedQuery(expandedQuery);
        }else{
            return expandedQuery;
        }


    };
    var nestedPredicatesESFragment = createNestedPredicateFragment(groupNestedPredicates(nestedPredicates));

    var createGeoPredicateESFragment = function(geoPredicate){
        return {
            "geo_distance": {
                "distance":geoPredicate['distance'],
                "location": [Number(geoPredicate['lon']),Number(geoPredicate['lat'])]
            }
        };
    };


    var predicatesESFragment = _.map(predicates, function (predicate) {

        var key = predicate["key"];
        var value = predicate["value"];

        //Handles the case where multiple values are submitted for one key
        if(_.isArray(value)){
            var retVal = [];
            _.each(value,function(val) {
                retVal.push(createEsQueryFragment(key,val));
            })
            return retVal;
        }else{
            return createEsQueryFragment(key,value);
        }

    });
    predicatesESFragment = _.flatten(predicatesESFragment);

    var geoPredicateExists = (Object.keys(geoPredicate).length>2);

    geoPredicateExists && predicatesESFragment.push(createGeoPredicateESFragment(geoPredicate));
    var allPredicateFragments=nestedPredicatesESFragment.concat(predicatesESFragment);

    var filter = {
        and: allPredicateFragments
    };

    var composedESQuery = {
        query: {
            filtered: {
                query: { match_all: {} }
            }
        }
    };

    allPredicateFragments.length>0 && (composedESQuery.query.filtered.filter=filter);

    function addInDefaultAggregationQuery(aggs,aggregationObject,extraShallowValues){
        //Todo: stop crash if no field is provided, or crash more elegantly.
        var isDeepAggregation = (aggregationObject.property.lastIndexOf(".")>0);
        var path = aggregationObject.property.substr(0, aggregationObject.property.lastIndexOf("."));
        var shallowAggs = {};
        shallowAggs[aggregationObject.type] =  {
            field: aggregationObject.property
        };
        _.each(extraShallowValues||[],function(extraShallowValue,extraShallowKey){
            shallowAggs[aggregationObject.type][extraShallowKey]=extraShallowValue;
        });

        //deep work should be repeated.
        if(isDeepAggregation){
            aggs[aggregationObject.name]={
                nested: {
                    path: path
                },
                aggs:{}
            }
            aggs[aggregationObject.name].aggs[aggregationObject.name]=shallowAggs;
        }else{
            aggs[aggregationObject.name] = shallowAggs;
        }
        return isDeepAggregation;
    }

    function getAggregationQuery(aggregationObjects){
        var aggs = {};
        _.each(aggregationObjects || [],function(aggregationObject){
            assertAggregationObjectHasRequiredOptions(aggregationObject);
            var isDeepAggregation = false;
            if(aggregationObject.type=="terms"){
                isDeepAggregation = addInDefaultAggregationQuery(aggs,aggregationObject, {size: aggregationObject.limit || DEFAULT_AGGREGATION_LIMIT});
            }else if (aggregationObject.type=="top_hits"){
                var shallowAggs = {
                    top_hits: {
                        size:aggregationObject.limit?Number(aggregationObject.limit) : DEFAULT_TOP_HITS_AGGREGATION_LIMIT
                    }
                };
                //Adds in sorting
                if(aggregationObject.sort){
                    _.each(aggregationObject.sort.split(','),function(sortParam) {
                        var sortDirection = (sortParam[0]!="-"?"asc":"desc");
                        sortDirection=="desc" && (sortParam = sortParam.substr(1));
                        shallowAggs.top_hits.sort= shallowAggs.top_hits.sort || [];
                        var sortTerm = {};
                        sortTerm[sortParam]={"order":sortDirection};
                        shallowAggs.top_hits.sort.push(sortTerm);
                    });
                }
                if(aggregationObject.fields){
                    shallowAggs.top_hits["_source"]={};
                    shallowAggs.top_hits["_source"]["include"] = aggregationObject.fields.split(',');
                }
                aggs[aggregationObject.name] = shallowAggs;

            }else if (aggregationObject.type=="stats" || aggregationObject.type=="extended_stats"){
                isDeepAggregation = addInDefaultAggregationQuery(aggs,aggregationObject);
            }

            if(aggregationObject.aggregations){
                var furtherAggs = getAggregationQuery(aggregationObject.aggregations);
                var relevantAggQueryObj = aggs[aggregationObject.name];
                if(isDeepAggregation){
                    //TODO:this should not be an equals; you may overwrite an agg here!
                    aggs[aggregationObject.name].aggs[aggregationObject.name]["aggs"]={"reverse_nesting":{"reverse_nested":{}}};
                    relevantAggQueryObj = aggs[aggregationObject.name].aggs[aggregationObject.name].aggs["reverse_nesting"]
                }

                if(!relevantAggQueryObj.aggs){
                    relevantAggQueryObj.aggs = furtherAggs;
                }else{
                    _.each(furtherAggs,function(furtherAgg,key){
                        relevantAggQueryObj.aggs[key]=furtherAgg;
                    });
                }
            }
        })
        return aggs;
    }

    composedESQuery.aggs = getAggregationQuery(aggregationObjects);
    if(geoPredicateExists){
        geoPredicate.unit = geoPredicate.distance.replace(/\d+/g, '');
        var distanceFunction=esDistanceFunctionLookup[geoPredicate.unit];

        if(distanceFunction){
            composedESQuery.script_fields = composedESQuery.script_fields || {};
            composedESQuery.script_fields.distance =
            {
                "params" : {
                    "lat" : Number(geoPredicate['lat']),
                    "lon" : Number(geoPredicate['lon'])
                },
                "script" : "doc[\u0027location\u0027]."+distanceFunction+"(lat,lon)"
            }
            composedESQuery["fields"]= [ "_source" ];
        }
    }

    if(sortParams){
        composedESQuery.sort = [];
        _.each(sortParams,function(sortParam){
            var sortTerm = {};
            var sortDirection = (sortParam[0]!="-"?"asc":"desc");
            sortDirection=="desc" && (sortParam = sortParam.substr(1));

            if (Util.hasDotNesting(sortParam)){
                //nested sort - not sure if this needs to be implemented.
            }else if (sortParam=="distance"){
                if(geoPredicateExists) {
                    sortTerm["_geo_distance"] =
                    {
                        "location": [Number(geoPredicate['lon']),Number(geoPredicate['lat'])],
                        "order": sortDirection,
                        "unit": geoPredicate.unit.toLowerCase(),
                        "mode": "min",
                        "distance_type": "sloppy_arc"
                    }
                }
            }else{
                //normal, simple sort
                sortTerm[sortParam]={order:sortDirection,"ignore_unmapped":true};
            }
            composedESQuery.sort.push(sortTerm);
        });
    }

    var composedEsQuerystr = JSON.stringify(composedESQuery);
    return  composedEsQuerystr;
};

//Todo: note if POSTS become much slower in production. If they do, drop POSTS from here - they're not really important.
//Todo: Note that this does not cover deletes.
ElasticHarvest.prototype.enableAutoIndexUpdateOnModelUpdate = function (endpoint,idField) {
    var _this = this;
    this.harvest_app.after(endpoint, function (req, res, next) {
        var entity = this;
        if (( req.method === 'POST' || req.method === 'PUT') && entity.id) {
            return _this.updateIndexForLinkedDocument(idField,entity);
        } else {
            return this;
        }
    });
//                 //Todo: finish support for deletes.
//    this.harvest_app.before(endpoint, function (req, res, next) {
//        var entity = this;
//        if ((req.method === 'DELETE') && entity.id) {
//            return _this.updateIndexForLinkedDocument(idField,entity,req.method);
//        } else {
//            return this;
//        }
//    });

};

///Searches elastic search at idField for entity.id & triggers a reindex. If method is DELETE, it'll
//handle the update specially, otherwise, you can ignore that param. Note that the delete param expects
//that the idField ends in .id.
ElasticHarvest.prototype.updateIndexForLinkedDocument = function (idField,entity,method) {
    var _this = this;
    return _this.simpleSearch(idField,entity.id)
        .then(function(result){
            return _this.expandAndSync(_.map(result.hits.hits,function(hit){
                //Todo: finish support for deletes.
//                if(method && method=="DELETE"){
//                    var objPath = idField.substr(0, idField.lastIndexOf(".id"));
//                    var objName = objPath.substr(objPath.lastIndexOf(".")+1,objPath.length);
//                    var closestParentObjPath = idField.substr(0, idField.lastIndexOf("."+objName));
//                    var closestParentObj = Util.getProperty(hit._source,closestParentObjPath);
//
//                    if(_.isArray(closestParentObj)){
//                        var closestParentObjName = closestParentObjPath.substr(closestParentObjPath.lastIndexOf(".")+1,closestParentObjPath.length);
//                        var closestParentObjParentPath = closestParentObjPath.substr(0, closestParentObjPath.lastIndexOf("."+closestParentObjName));
//                        var closestParentObjectParent = Util.getProperty(hit._source,closestParentObjParentPath);
//
//                        closestParentObjectParent[closestParentObjName]=_.reject(closestParentObj,function(object){
//                            return object.id==entity.id;
//                            //issue: the array can be of other objects, and the affected object may be
//                            //really deep. We need an expanded query syntax that can query into arrays to sole
                              //this issue.
//                        })
//                    }else{
//                        delete closestParentObj[objName];
//                    }
//                }
                return unexpandEntity(hit._source);
            })).then(function(result){
                return entity;
            });
        });
};

//Takes a search predicate (or nested predicate) field & value and returns a promise for corresponding models.
ElasticHarvest.prototype.simpleSearch = function (field,value) {
    var predicates=[];
    var nestedPredicates=[];
    if(field.indexOf(".")==-1){
        var predicate = {};
        predicate[field]=value;
        predicates.push(predicate);
    }else{
        var nestedPredicate = [field,value];
        nestedPredicates.push(nestedPredicate);
    }
    var reqBody = this.getEsQueryBody(predicates,nestedPredicates,{},[],undefined);
    var _this = this;
    var params=[];
    params.push("size="+DEFAULT_SIMPLE_SEARCH_LIMIT);
    var queryStr = '?'+params.join('&');

    var es_resource = this.es_url + '/'+this.index+'/'+this.type+'/_search'+queryStr;
    return requestAsync({uri:es_resource, method: 'GET', body: reqBody}).then(function(response) {
        var es_results = JSON.parse(response[1]);
        if (es_results.error) {
            console.warn(es_results.error);
            throw new Error("Your query was malformed, so it failed. Please check the api to make sure you're using it correctly.");
        } else {
            return es_results;
        }
    });

}

/** Delete Related **/
//delete: Just deletes the #id item of the initialized type.
ElasticHarvest.prototype.delete = function(id){
    var _this = this;
    var es_resource = this.es_url + '/'+this.index+'/'+this.type+'/'+id;
    return requestAsync({uri:es_resource, method: 'DELETE', body: ""}).then(function(response){
        var body = JSON.parse(response[1]);
        if(!body.found){
            throw new Error("Could not find " + _this.type +" "+id+ " to delete him from elastic search.");
        }
        return body;
    });
}


/** POST RELATED **/
//Note - only 1 "after" callback is allowed per endpoint, so if you enable autosync, you're giving it up to elastic-harvest.
ElasticHarvest.prototype.enableAutoSync= function(endpoint){
    var _this = this;
    this.harvest_app.after(endpoint, function (req, res, next) {
        if (req.method === 'POST' || (req.method === 'PUT' && this.id)) {
            return _this.expandAndSync(this)
                .then(function(response){
                    return unexpandEntity(response);
                });
        } else {
            return this;
        }
    });
};

//expandAndSync: will expand all links in the model, then push it to elastic search.
//Works with one model or an array of models.
//Todo: move to batch update model for multiples models.
ElasticHarvest.prototype.expandAndSync = function (models) {
    var inputIsArray = _.isArray(models);
    models = [].concat(models);
    var _this = this;
    var promises = _.map(models,function(model){
        return _this.expandEntity(model).then(function(result) {
            return _this.sync(result);
        })
    });
    return inputIsArray?RSVP.all(promises):promises[0];
}

//sync: will push model to elastic search WITHOUT expanding any links.
ElasticHarvest.prototype.sync = function(model){
    var esBody = JSON.stringify(model);
    var _this = this;
    var options = {uri: this.es_url + '/'+this.index+'/'+this.type+'/' + model.id, body: esBody,pool:postPool};

    return new RSVP.Promise(function (resolve, reject) {
        request.put(options, function (error, response, body) {
            body = JSON.parse(body);
            if (error || body.error) {
                var errMsg = error?error.message?error.message:JSON.stringify(error):JSON.stringify(body.error);
                console.warn("[Elastic-Harvest] es_sync failed on model "+model.id+" :",errMsg);
                reject(error || body);
            } else {
                resolve(model);
            }
        });
    })
    .catch(function (error) {
        throw new Error(_this.type+ " "+ (model.id?model.id:"")+ " was unable to be added to the elastic search index. This likely means that one or more links were unable to be found.");
    });
};

function depthIsInScope(options,depth,currentPath){
    if(depth>options.graphDepth.default)
        return false;
    return true;
}

ElasticHarvest.prototype.expandEntity = function (entity,depth,currentPath){
    if(!depthIsInScope(this.options,depth,currentPath)){
        return;
    }
    if(entity==undefined)
        return;
    !depth && (depth=0);
    var promises = {};
    var _this = this;
    //The first step to expand an entity is to get the objects it's linked to.
    _.each(entity.links || {}, function(val,key,list){
        var collectionName = _this.collectionLookup[key];
        if(collectionName) {
            var findFnName = "find";
            if(_.isArray(entity.links[key])){
                findFnName = "findMany";
            }
            promises[key] = _this.adapter[findFnName](collectionName, entity.links[key]).then(function(result){

                if(depth>0){
                    entity[key] = result;
                }else{
                    entity.links[key] = result;
                }
                return result;
            },function(err){
                var errorMessage = err || (""+ val+ " could not be found in "+collectionName);
                //TODO: finish support for deletes. Maybe this comes back as an error & rejects the update.
//                if(depth>0){
//                    delete entity[key];
//                }else{
//                    delete entity.links[key];
//                }
                console.warn(errorMessage);
                throw new Error(errorMessage);
            });
        }else{
            console.warn("[Elastic-Harvest] Failed to find the name of the collection with "+key +" in it.");
        }
    },this);

    //The only "links" parameter at the end of the expansion should be on the original entity;
    if(depth>0) {
        delete entity.links;
    }

    //To handle "links" of those freshly found objects, a bit of recursion.
    return RSVP.hash(promises).then(function(results) {
        var furtherRequiredExpansions = {};
        var newDepth = depth+1;
        _.each(results || {}, function (val, key, list) {

            if(val && val.links){
                furtherRequiredExpansions[key]=_this.expandEntity(val,newDepth);
            }else if (val && _.isArray(val)){
                //ToDo: a further optimization might be to group all similar requests across array elements & fire them off as 1 request.
                _.each(val,function(value){
                    if(value.links){
                        !furtherRequiredExpansions[key] && (furtherRequiredExpansions[key] = []);
                        furtherRequiredExpansions[key].push(_this.expandEntity(value,newDepth));
                    }
                });

                if(furtherRequiredExpansions[key]){
                    furtherRequiredExpansions[key] = RSVP.all(furtherRequiredExpansions[key]);
                }
            }
        });
        //Patch the results of recursion (to "depth+1" level) into the "depth" level entity
        return RSVP.hash(furtherRequiredExpansions).then(function(response){
            _.each(response || {}, function (val, key, list) {
                if(depth>0){
                    entity[key]=val;
                }else{
                    entity.links[key]=val;
                }
            });
            return entity;
        });
    });
}


ElasticHarvest.prototype.initializeIndex=function() {
    var url = this.es_url + '/'+this.index;
    console.log("[Elastic-Harvest] Initializing es index.");
    return requestAsync({uri:url, method: 'PUT', body:""}).then(function(response){
        var body = JSON.parse(response[1]);
        if(body.error){
            throw new Error(response[1]);
        }else{
            return body;
        }
    });

};

ElasticHarvest.prototype.deleteIndex=function() {
    var url = this.es_url + '/'+this.index;
    console.log("[Elastic-Harvest] Deleting es index.");
    return requestAsync({uri:url, method: 'DELETE', body:""}).then(function(response){
        var body = JSON.parse(response[1]);
        if(body.error){
            if(_s.contains(body.error,"IndexMissingException")){
                console.warn("[Elastic-Harvest] Tried to delete the index, but it was already gone!");
                return body;
            }else{
                throw new Error(response[1]);
            }
        }else{
            return body;
        }
    });

};

//Posts an elastic search mapping to the server.Idempotent, so feel free to do this when starting up your server,
//but if you change the mapping in a way that elastic search can't apply a transform to the current index to get there,
//you'll have to reload the entire search index with new data, because this will fail.
ElasticHarvest.prototype.initializeMapping=function(mapping,shouldNotRetry){

    var _this = this;
    var reqBody = JSON.stringify(mapping);
    var es_resource = this.es_url + '/'+this.index+'/'+this.type+'/_mapping';
    return requestAsync({uri:es_resource, method: 'PUT', body:reqBody}).then(function(response){
        var body = JSON.parse(response[1]);
        if(body.error){
            if(_s.startsWith(body.error,"IndexMissingException") && !shouldNotRetry){
                console.warn("[Elastic-Harvest] Looks like we need to create an index - I'll handle that automatically for you & will retry adding the mapping afterward.")
                return _this.initializeIndex().then(function(){return _this.initializeMapping(mapping,true)});
            }else{
                throw new Error(response[1]);
            }
        }else{
            return body;
        }
    });
};


function getCollectionLookup(harvest_app,type){

    var schemaName = inflect.singularize(type);
    var startingSchema = harvest_app._schema[schemaName];
    var retVal = {};
    var maxDepth=20;
    var depth=0;
    var linkedSchemas = {};
    linkedSchemas[schemaName]=true;

    function getLinkedSchemas(startingSchema){

        depth++;
        if (depth>=maxDepth){
            console.warn("[Elastic-Harvest] Graph depth of "+depth+" exceeds "+maxDepth+". Graph dive halted prematurely - please investigate.");//harvest schema may have circular references.
            return;
        }

        function setValueAndGetLinkedSchemas(propertyName,propertyValue){
            retVal[propertyName]=propertyValue;
            !linkedSchemas[propertyName] && harvest_app._schema[propertyValue] && (linkedSchemas[propertyName]=true) && getLinkedSchemas(harvest_app._schema[propertyValue]);
        }
        _.each(startingSchema,function(property,propertyName){

            if([typeof property]!="function") {
                if(_.isString(property)) {
                    setValueAndGetLinkedSchemas(propertyName,property);
                }else if (_.isArray(property)){
                    if(_.isString(property[0])){
                        setValueAndGetLinkedSchemas(propertyName,property[0]);
                    }else{
                        setValueAndGetLinkedSchemas(propertyName,property[0].ref);
                    }
                }else if (_.isObject(property)){
                    setValueAndGetLinkedSchemas(propertyName,property.ref);
                }
            }
        });
    };

    getLinkedSchemas(startingSchema);
    return retVal;
}

module.exports = ElasticHarvest;