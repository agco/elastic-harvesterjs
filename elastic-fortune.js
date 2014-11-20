var ObjectId = require('mongoose').Types.ObjectId;
var request = require('request');
var _s = require('underscore.string');
var _ = require('lodash');
var RSVP = require('rsvp');
var Util =  require("./Util");

//Bonsai wants us to only send 1 ES query at a time.
var http = require('http');
var eSSyncPool = new http.Agent();
eSSyncPool.maxSockets = 1;

function ElasticFortune (fortune_app,es_url,index,type,collectionNameLookup) {
    var _this= this;

    this.adapter = fortune_app.adapter;
    this.fortune_app = fortune_app;
    this.collectionNameLookup = collectionNameLookup;

    this.es_url=es_url;
    this.index=index;
    this.type = type;

    /** SEARCH RELATED **/
    this.route = function (req, res, next){
        var predicates = [];
        var nestedPredicates = [];
        var geoPredicate = {};
        var sortParams = req.query["sort"];
        sortParams && (sortParams = sortParams.split(','));

        var reservedQueryTerms = ["aggregations.fields","include","limit","offset","sort","fields"];

        _.each(req.query, function (value,key) {

            if (_s.startsWith(key, "geo_distance.")) {
                geoPredicate[key.substr(13)]=req.query[key];
                //TODO: return error if geoPredicate distance is not supplied with a unit.
            } else if (_s.startsWith(key, "links.")) {
                nestedPredicates.push([key, req.query[key]]);
            }
            else if (!_.contains(reservedQueryTerms,key)){
                predicates.push({key:key,value:req.query[key]});
            }
        });

        nestedPredicates = _.filter(nestedPredicates, function (nestedPredicate) {
            return nestedPredicate.length === 2;
        });

        var aggregationsFields = req.query['aggregations.fields']? req.query['aggregations.fields'].split(","):[];

        var esQuery = createEsQuery(predicates, nestedPredicates, geoPredicate, aggregationsFields,sortParams);
        esSearch(esQuery,req,res,next);
    };

    function transformSourceObjectToSimplyLinkedObject(sourceObject,fields){
        _.each(sourceObject.links || [],function(val,key){
            if(!_.isArray(sourceObject.links[key])){
                sourceObject.links[key] = ObjectId(val.id);

            }else{
                _.each(sourceObject.links[key],function(innerVal,innerKey){
                    sourceObject.links[key][innerKey] = ObjectId(innerVal.id);
                })
            }
        })
        fields && fields.length && (sourceObject = Util.includeFields(sourceObject,fields));
        return sourceObject;
    }

    function getResponseArrayFromESResults(results,fields){

        var retVal = [];
        if (results && results.hits && results.hits.hits){
            _.each(results.hits.hits,function(hit){
                retVal.push(transformSourceObjectToSimplyLinkedObject(hit._source,fields));
            })
        }
        return retVal;
    }

    //FortuneRoute is used to appendLinks & appendLinked.
    this.setFortuneRoute = function(fortuneRoute){
        this.fortuneRoute = fortuneRoute;
    }

    function sendSearchResponse(es_results, res, includes,fields) {
        var initialPromise = RSVP.resolve();
        var padding = undefined;
        (process.env.NODE_ENV!="production") && (padding = 2);

        return initialPromise.then(function(){
            var esResponseArray = getResponseArrayFromESResults(es_results,fields);
            var objToBeAppended = {};
            objToBeAppended[type]= esResponseArray;
            var esResponse = _this.fortuneRoute.appendLinks(objToBeAppended);

            _this.fortuneRoute.appendLinked(esResponse,includes)
                .then(function(esResponse) {

                //Add in meta.aggregations field
                if (es_results && es_results.aggregations) {
                    var createBuckets = function (terms) {
                        return _.map(terms, function (term) {
                            return {key: term.key, count: term.doc_count}
                        });
                    };

                    var createAggregations = function (es_results) {
                        var meta = {
                            aggregations: {
                            }
                        };
                        _.forIn(es_results.aggregations, function (value, key) {
                            if(value["buckets"])
                                meta.aggregations[key] = createBuckets(value.buckets);
                            else if (value[key] && value[key]["buckets"]){
                                meta.aggregations[key] = createBuckets(value[key]["buckets"]);
                            }

                        });
                        return meta;
                    };
                    esResponse.meta = createAggregations(es_results);
                }

                //Add in meta.geo_distance
                if (es_results && es_results.hits && es_results.hits.hits && es_results.hits.hits[0] && es_results.hits.hits[0].fields && es_results.hits.hits[0].fields.distance){
                    esResponse.meta = esResponse.meta || {};
                    esResponse.meta.geo_distance={};
                    _.each(es_results.hits.hits,function(hit){
                        var distance = hit.fields.distance[0];
                        var objId = hit._id;
                        var type = hit._type;
                        esResponse.meta.geo_distance[type] = esResponse.meta.geo_distance[type] || {};
                        esResponse.meta.geo_distance[type][objId]=distance;
                    });
                }

                return res
                    .set('content-type', 'application/vnd.api+json') //todo set jsonapi ct
                    .status(200)
                    .send(JSON.stringify(esResponse,undefined, padding));
            }, function(error){

                return res
                    .set('content-type', 'application/vnd.api+json') //todo set jsonapi ct
                    .status(400)
                    .send(JSON.stringify(esResponse,undefined, padding));
            });
        });
    }

    function esSearch(esQuery,req,res) {
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
                return sendSearchResponse(es_results, res,includes,fields);
            }
        });
    }

    function createEsQuery(predicates, nestedPredicates, geoPredicate, aggregationsFields,sortParams) {

        var createEsQueryFragment = function (fields, queryVal) {

            return {
                "query": {
                    "query_string": {
                        "fields": [fields],
                        "query": queryVal
                    }
                }};
        };


        var createMatchQueryFragment = function (field,value){
            var fragment = {"query":{"match":{}}};
            fragment["query"]["match"][field]=value;

            return fragment;
        }
        createEsQueryFragment = createMatchQueryFragment;

        /*
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
                    var matchObj = innerQuery.nested.query.match;
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
                                console.warn("Our match query isn't supposed to have multiple keys in it. We expect something like {match:{name:'Peter'}}, and you've constructed a match like {match:{name:'Peter',type:'person'}}");
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

        if (aggregationsFields.length) {
            composedESQuery.aggs = {};
            _.each(aggregationsFields,function(aggregationsField){
                var isNestedAggregation = (aggregationsField.lastIndexOf(".")>0);
                var path = aggregationsField.substr(0, aggregationsField.lastIndexOf("."));

                var unnestedAggs = {
                    terms: {
                        field: aggregationsField,
                        size:0
                    }
                };
                if(isNestedAggregation){
                    composedESQuery.aggs[aggregationsField]={
                        nested: {
                            path: path
                        },
                        aggs:{}
                    }
                    composedESQuery.aggs[aggregationsField].aggs[aggregationsField]=unnestedAggs;
                }else{
                    composedESQuery.aggs[aggregationsField] = unnestedAggs;
                }
            })
        }

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

                if (_s.startsWith(sortParam, "links.")) {
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
    }

    var esDistanceFunctionLookup={
        mi:"arcDistanceInMiles",
        miles:"arcDistanceInMiles",
        km:"arcDistanceInKm",
        kilometers:"arcDistanceInKm",
        m: "arcDistance",
        meters:"arcDistance"
    }
    return this;
}

/** POST RELATED **/

//Note - only 1 "after" callback is allowed per endpoint, so if you enable autosync, you're giving it up to elastic-fortune.
ElasticFortune.prototype.enableAutoSync= function(endpoint){
    var _this = this;
    this.fortune_app.after(endpoint, function (req, res, next) {
        if (req.method === 'POST' || (req.method === 'PUT' && this.id)) {
            return _this.expandAndSync(this);
        } else {
            return this;
        }
    });
};

//expandAndSync: will expand all links in the model, then push it to elastic search
ElasticFortune.prototype.expandAndSync = function(model) {
    var _this=this;
    return this.expandEntity(model).then(function(result) {
        return _this.sync(result);
    })
}

//sync: will push model to elastic search WITHOUT expanding any links.
ElasticFortune.prototype.sync = function(model){
    var esBody = JSON.stringify(model);
    var options = {uri: this.es_url + '/'+this.index+'/'+this.type+'/' + model.id, body: esBody,pool:eSSyncPool};

    return new RSVP.Promise(function (resolve, reject) {
        request.put(options, function (error, response, body) {
            body = JSON.parse(body);
            if (error || body.error) {
                var errMsg = error?error.message?error.message:JSON.stringify(error):JSON.stringify(body.error);
                console.warn("es_sync failed on model "+model.id+" :",errMsg);
                reject(error || body);
            } else {
                resolve(model);
            }
        });
    })
    .catch(function (error) {
        throw new Error("Dealer was unable to be added to the elastic search index. This likely means that one or more links were unable to be found.");
    });
};

ElasticFortune.prototype.expandEntity = function (entity,depth){
    if(entity==undefined)
        return;
    !depth && (depth=0);
    var promises = {};
    var _this = this;
    //The first step to expand an entity is to get the objects it's linked to.
    _.each(entity.links || {}, function(val,key,list){
        var collectionName = _this.collectionNameLookup[key];
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
                console.warn(errorMessage);

            });
        }else{
            console.warn("Failed to find the name of the collection with "+key +" in it.");
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

module.exports = ElasticFortune;