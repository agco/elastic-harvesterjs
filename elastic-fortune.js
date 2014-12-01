var ObjectId = require('mongoose').Types.ObjectId;
var request = require('request');
var bluebird = require('bluebird');
var requestAsync = bluebird.promisify(require('request'));

var _s = require('underscore.string');
var _ = require('lodash');
var RSVP = require('rsvp');
var Util =  require("./Util");

//Bonsai wants us to only send 1 ES query at a time, for POSTs/PUTs. Later on we can add more pools for other requests if needed.
var http = require('http');
var postPool = new http.Agent();
postPool.maxSockets = 1;

var DEFAULT_AGGREGATION_LIMIT = 0;//0=>Integer.MAX_VALUE
var DEFAULT_TOP_HITS_AGGREGATION_LIMIT = 10; //Cannot be zero. NOTE: Default number of responses in top_hit aggregation is 10.

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

        var reservedQueryTerms = ["aggregations","aggregations.fields","include","limit","offset","sort","fields"];
        reservedQueryTerms = reservedQueryTerms.concat(getAggregationFields(req.query));
        var reservedQueryTermLookup = Util.toObjectLookup(reservedQueryTerms);

        _.each(req.query, function (value,key) {

            if (_s.startsWith(key, "geo_distance.")) {
                geoPredicate[key.substr(13)]=req.query[key];
                //TODO: return error if geoPredicate distance is not supplied with a unit.
            } else if (_s.startsWith(key, "links.")) {
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
                req.query[oldfield+".field"]=oldfield;

            });
        }
        var aggregationObjects = getAggregationObjects(req.query);



        var esQuery = createEsQuery(predicates, nestedPredicates, geoPredicate,aggregationObjects, sortParams);
        esSearch(esQuery,req,res,next);
    };

    /*
        Terms aggregations:
        field, order (essentially a sort), "min_doc_count": 10, include, exclude, script

        Idea: what if we just allow ANY terms to be specified on an aggregation & patch it together? Special one is size.
            //No - it'll require that we go through every query param when trying to create our exclusion list... v inefficient.
        0) Protect predicates from agg syntax.
        1) Create way to parse off agg parts.  | test? run whole query below
        2) Preserve current agg syntax using new code.
        3) Get simple subaggregates to work
        4) Get nested buckets from subaggreagate ES answers into response
        7) Move syntax back so user can define what name they want queries to be run under.
        5) Get complex nested subqggregates to work (ones with links.*.*)
        6) Support complex nested sub-aggregate responses from ES.
        7) Get multiple aggs & subaggs at different nesting levels to work properly.
        8) Add support for top_hits aggregate
        9) Get top_hits respose into returned response from dealer-api.
        10) Get top_hits subaggregate working // Failed; Elastic search does not support this. If you think about it, tophits doesn't actually do a transform, so it doesn't matter.
        9) Test support for required fields for kristof's command below.
        ==
        +++ Add support for changing collections.
        1) Figure out exactly how you want to auto-update when other collections change.
        2) Create Internal Search apparatus that allows us to figure out which dealers need to be updated when other collections change.
        3) Get each entire documents we need & strip them back to be the simple documents that went in.
        4) Expand links for the simple documents & put them back in ES, at the same ids.
        5) Test by posting an update to country name & searching for all dealers with that country name.


     aggregations=eq_agg
     &eq_agg.type=terms
     &eq_agg.field=links.equipment.id
     &eq_agg.aggregations=eq_agg_position_latest,eq_agg_variables

     &eq_agg_position_latest.type=top_hits
     &eq_agg_position_latest.sort=-time
     &eq_agg_position_latest.limit=1
     &eq_agg_position_latest.include=id,time,loc,alt,head

     &eq_agg_variables.type=terms
     &eq_agg_variables.field=tracking_data.spn
     &eq_agg_variables.aggregations=eq_agg_variables_latest

     &eq_agg_variables_latest.type=top_hits
     &eq_agg_variables_latest.sort=-time
     &eq_agg_variables_latest.limit=1
     &eq_agg_variables_latest.include=tracking_data

     TESTS:
     Predicates not affected by aggregation defined terms.
     http://localhost:8081/dealers/search?aggregations=a&a.field=links.address_state_province.code&a.aggregations=b&b.aggregations=c

     Multiple simple aggregates
     http://localhost:8081/dealers/search?aggregations=asp,ctt&asp.field=code&ctt.field=zip

     Multiple complex aggregates
     http://localhost:8081/dealers/search?aggregations=asp,ctt&asp.field=links.address_state_province.code&ctt.field=links.address_state_province.description

     Multiple simple aggregates & subaggregates
     http://localhost:8081/dealers/search?aggregations=asp,ctt&asp.field=code&ctt.field=zip&asp.aggregations=tty,parent&tty.field=id&parent.field=parent_code&tty.aggregations=ppg&ppg.field=city


     Multiple complex aggregates & subaggregates
     http://localhost:8081/dealers/search?aggregations=asp,ctt&asp.field=links.address_state_province.code&ctt.field=links.address_state_province.description&ctt.aggregations=ffs&ffs.field=links.address_country.description&ffs.aggregations=bba,bbb&bba.field=links.address_country.code&bbb.field=links.address_state_province.code


     Top hits aggregation:
     http://localhost:8081/dealers/search?aggregations=asp&asp.field=links.address_state_province.code&asp.aggregations=bbt&bbt.type=top_hits&bbt.include=name,id

     Top hits aggregation / limit:
     http://localhost:8081/dealers/search?aggregations=asp&asp.field=links.address_state_province.code&asp.aggregations=bbt&bbt.limit=2&bbt.type=top_hits&bbt.include=name,id


     //Todo: stop crash if no field is provided, or crash more elegantly.
        Test: http://localhost:8081/dealers/search?aggregations=asp,zeep&asp.field=links.address_state_province.code&asp.aggregations=bbt&bbt.field=city

    NOTES:
     + Aggs provided by old-style syntax will be transformed to new style syntax on the query string & will replace other (new style) aggs sent in with identical names.
     + DEFAULT_TOP_HITS_AGGREGATION_LIMIT = 10; //Cannot be zero/MAXINT. NOTE: Default number of responses in top_hit aggregation is 10.
     + DEFAULT_AGGREGATION_LIMIT = 0; (MaxInt)
     + Top_hits aggregation cannot be nested - you're going to need to slightly change your initial query syntax. Otherwise, it looks good.
     + Agg results are placed  in the parent object, therefore aggregations with conflicting names may cause issues (egg subaggregate called "key") -> bug: doing so returns entire key es_response!.

     */


    var permittedAggOptions = {
        top_hits:["type","sort","limit","include"],
        terms:["type","order","field","aggregations"]
    }

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
            setValueIfExists(aggregation,"field",query[agg+".field"],assertIsNotArray);
            setValueIfExists(aggregation,"type",query[agg+".type"] || "terms",assertIsNotArray);
            setValueIfExists(aggregation,"order",query[agg+".order"],assertIsNotArray);
            setValueIfExists(aggregation,"sort",query[agg+".sort"],assertIsNotArray);
            setValueIfExists(aggregation,"limit",query[agg+".limit"],assertIsNotArray);
            setValueIfExists(aggregation,"include",query[agg+".include"],assertIsNotArray);

            if( query[agg+".aggregations"]){//TODO: also, if type allows nesting (aka, type is a bucket aggregation)
                aggregation.aggregations = getAggregationObjects(query,agg+".aggregations");
            }

            return aggregation;
        })
    }

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

    function getSourceObj(esResponseObject){
        var obj = esResponseObject["_source"];
     return obj;
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
                            //1. see if there are other terms & if they have buckets.
                            var retVal = {key: term.key, count: term.doc_count};

                            _.each(term,function(aggResponse,responseKey){
                                if(responseKey=="key" || responseKey=="doc_count"){
                                    return;
                                }else if(aggResponse.buckets) {
                                    retVal[responseKey] = createBuckets(aggResponse.buckets);

                                }else if (aggResponse.hits && aggResponse.hits.hits){
                                    //top_hits aggs result from nested query w/o reverse nesting.
                                    retVal[responseKey] = _.map(aggResponse.hits.hits,function(esReponseObj){
                                        return esReponseObj["_source"];
                                    });
                                    //to combine nested aggs w others, you have to un-nest them, & this takes up an aggregation-space.
                                }else if(responseKey=="reverse_nesting"){
                                    _.each(aggResponse,function(reverseNestedResponseProperty,reverseNestedResponseKey){
                                        if(reverseNestedResponseProperty!="doc_count" && (reverseNestedResponseProperty.buckets)){
                                            retVal[reverseNestedResponseKey] = createBuckets(reverseNestedResponseProperty.buckets);
                                            //this gets a little complicated because reverse-nested then renested subdocuments are .. complicated (because the extra aggs for nesting throws things off).
                                        }else if (reverseNestedResponseProperty!="doc_count" && reverseNestedResponseProperty[reverseNestedResponseKey] && reverseNestedResponseProperty[reverseNestedResponseKey].buckets){
                                            retVal[reverseNestedResponseKey] = createBuckets(reverseNestedResponseProperty[reverseNestedResponseKey].buckets);

                                            //this gets a little MORE complicated because of reverse-nested then renested top_hits aggs
                                        }else if (reverseNestedResponseProperty!="doc_count" && reverseNestedResponseProperty.hits && reverseNestedResponseProperty.hits.hits){
                                            retVal[reverseNestedResponseKey] = _.map(reverseNestedResponseProperty.hits.hits,function(esReponseObj){
                                              return esReponseObj["_source"];
                                            });
                                        }

                                    });
                                }
                            });
                            return retVal;
                            //Todo: ended day here -> start by recursively turning out term's extra params (e.g. name)'s buckets
                        });
                    };

                    var createAggregations = function (es_results) {
                        var meta = {
                            aggregations: {
                            }
                        };
                        _.forIn(es_results.aggregations, function (value, key) {
                            if (value["buckets"])
                                meta.aggregations[key] = createBuckets(value.buckets);
                            else if (value[key] && value[key]["buckets"]) {
                                meta.aggregations[key] = createBuckets(value[key]["buckets"]);
                            } else if (value.hits && value.hits.hits) {
                                //top_hits aggs result from totally un-nested query
                                meta.aggregations[key] = _.map(value.hits.hits, function (esReponseObj) {
                                    return esReponseObj["_source"];
                                });
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

    var requiredAggOptions = {
        top_hits:["type","include"],
        terms:["type","field"]
    }

    function assertAggregationObjectHasRequiredOptions(aggregationObject){
        var type = aggregationObject.type||"terms";
        _.each(requiredAggOptions[type],function(requiredOption){
            Util.assertAsDefined(aggregationObject[requiredOption],type+" aggregations require that a '"+requiredOption+"' paramenter is specified.");
        })
    }


    function createEsQuery(predicates, nestedPredicates, geoPredicate,aggregationObjects,sortParams) {

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

        function getAggregationQuery(aggregationObjects){
            var aggs = {};
            _.each(aggregationObjects || [],function(aggregationObject){
                assertAggregationObjectHasRequiredOptions(aggregationObject);
                var isDeepAggregation = false;
                if(aggregationObject.type=="terms"){
                    //Todo: stop crash if no field is provided, or crash more elegantly.
                    isDeepAggregation = (aggregationObject.field.lastIndexOf(".")>0);
                    var path = aggregationObject.field.substr(0, aggregationObject.field.lastIndexOf("."));
                    var shallowTermsAggs = {
                        terms: {
                            field: aggregationObject.field,
                            size:aggregationObject.limit || DEFAULT_AGGREGATION_LIMIT
                        }
                    };
                    //deep work should be repeated.
                    if(isDeepAggregation){
                        aggs[aggregationObject.name]={
                            nested: {
                                path: path
                            },
                            aggs:{}
                        }
                        aggs[aggregationObject.name].aggs[aggregationObject.name]=shallowTermsAggs;
                    }else{
                        aggs[aggregationObject.name] = shallowTermsAggs;
                    }
                }else if (aggregationObject.type="top_hits"){
                    var shallowTermsAggs = {
                        top_hits: {
                            size:aggregationObject.limit?Number(aggregationObject.limit) : DEFAULT_TOP_HITS_AGGREGATION_LIMIT
                        }
                    };
                    //Adds in sorting
                    if(aggregationObject.sort){
                        _.each(aggregationObject.sort.split(','),function(sortParam) {
                            var sortDirection = (sortParam[0]!="-"?"asc":"desc");
                            sortDirection=="desc" && (sortParam = sortParam.substr(1));
                            shallowTermsAggs.top_hits.sort= shallowTermsAggs.top_hits.sort || [];
                            var sortTerm = {};
                            sortTerm[sortParam]={"order":sortDirection};
                            shallowTermsAggs.top_hits.sort.push(sortTerm);
                        });
                    }
                    if(aggregationObject.include){
                        shallowTermsAggs.top_hits["_source"]={};
                        shallowTermsAggs.top_hits["_source"]["include"] = aggregationObject.include.split(',');
                    }
                    aggs[aggregationObject.name] = shallowTermsAggs;

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
        console.warn(JSON.stringify(composedESQuery.aggs));
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
/** Delete Related **/
//delete: Just deletes the #id item of the initialized type.
ElasticFortune.prototype.delete = function(id){
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
    var options = {uri: this.es_url + '/'+this.index+'/'+this.type+'/' + model.id, body: esBody,pool:postPool};

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