'use strict';

// dependencies
const request = require('request');
const Promise = require('bluebird');
const requestAsync = Promise.promisify(require('request'));
const $http = require('http-as-promised');
const _s = require('underscore.string');
const inflect = require('i')();
const _ = require('lodash');
const Util = require('./Util');
const autoUpdateInputGenerator = new (require('./autoUpdateInputGenerator'))();
const SampleScript = require('./lib/scripts/sampler');
const sendError = require('harvesterjs').sendError;
const JsonApiError = require('harvesterjs').JSONAPI_Error;
const Cache = require('./lib/singletonAdapterCache');
const http = require('http');


// Bonsai wants us to only send 1 ES query at a time, for POSTs/PUTs. Later on we can add more pools for other requests
// if needed.
const postPool = new http.Agent();
postPool.maxSockets = 1;

// 0 => Integer.MAX_VALUE
const DEFAULT_AGGREGATION_LIMIT = 0;

// Cannot be zero. NOTE: Default number of responses in top_hit aggregation is 10.
const DEFAULT_TOP_HITS_AGGREGATION_LIMIT = 10;

// simple searches don't specify a limit, and are only used internally for autoupdating
const DEFAULT_SIMPLE_SEARCH_LIMIT = 1000;
const defaultOptions = {
  asyncInMemory: false,
  graphDepth: {
    default: 3
  }
};


function ElasticHarvest(harvestApp, esUrl, index, type, options) {
  console.warn('[Elastic-Harvest] delete functionality does not work with ElasticSearch 2.x or greater.');
  const _this = this;

  if (harvestApp) {
    this.collectionLookup = getCollectionLookup(harvestApp, type);
    this.autoUpdateInput = autoUpdateInputGenerator.make(harvestApp, type);
    this.invertedAutoUpdateInput = generateUpdateMap(this.autoUpdateInput);
    this.adapter = harvestApp.adapter;
    this.harvest_app = harvestApp;
    Cache.initCache(harvestApp.adapter);
    this.singletonCache = Cache.getInstance();
  } else {
    console.warn('[Elastic-Harvest] Using elastic-harvester without a harvest-app. Functionality will be limited.');
  }
  this.es_url = esUrl;
  this.index = index;
  this.type = type;
  this.options = _.merge(defaultOptions, options);

  /** SEARCH RELATED **/
  this.route = function route(req, res, next) {
    const predicates = [];
    let nestedPredicates = [];
    const geoPredicate = {};
    let sortParams = req.query.sort;

    sortParams && (sortParams = sortParams.split(','));

    let reservedQueryTerms = ['aggregations', 'aggregations.fields', 'include', 'limit', 'offset', 'sort', 'fields',
      'script', 'script.maxSamples'];
    reservedQueryTerms = reservedQueryTerms.concat(getAggregationFields(req.query));

    const reservedQueryTermLookup = Util.toObjectLookup(reservedQueryTerms);

    _.each(req.query, (value, key) => {
      if (_s.startsWith(key, 'geo_distance.')) {
        geoPredicate[key.substr(13)] = req.query[key];
        // TODO: return error if geoPredicate distance is not supplied with a unit.
      } else if (!reservedQueryTermLookup[key] && Util.hasDotNesting(key)) {
        nestedPredicates.push([key, req.query[key]]);
      } else if (!reservedQueryTermLookup[key]) {
        predicates.push({ key, value: req.query[key] });
      }
    });

    nestedPredicates = _.filter(nestedPredicates, (nestedPredicate) => {
      return nestedPredicate.length === 2;
    });

    // Support deprecated "aggregations.fields" aggregation param by converting those params to new query format
    if (req.query['aggregations.fields']) {
      const oldFields = req.query['aggregations.fields'].split(',');
      _.each(oldFields, (oldfield) => {
        if (req.query.aggregations) {
          req.query.aggregations = `${req.query.aggregations},${oldfield}`;
        } else {
          req.query.aggregations = oldfield;
        }
        req.query[`${oldfield}.property`] = oldfield;
      });
    }
    const aggregationObjects = getAggregationObjects(req.query);
    const esQuery = _this.getEsQueryBody(predicates, nestedPredicates, geoPredicate, aggregationObjects, sortParams);
    esSearch(esQuery, aggregationObjects, req, res, next);
  };

  const permittedAggOptions = {
    top_hits: ['type', 'sort', 'limit', 'fields', 'include'],
    terms: ['type', 'order', 'aggregations', 'property'],
    stats: ['type', 'property'],
    extended_stats: ['type', 'property', 'sigma'],
    date_histogram: ['type', 'property', 'interval', 'timezone', 'offset'],
    range: ['type', 'property', 'ranges']
  };

  function setValueIfExists(obj, property, val, fn) {
    (val) && (fn ? fn(val, property) : true) && (obj[property] = val);
    return obj;
  }

  function assertIsNotArray(val, property) {
    if (_.isArray(val)) {
      throw new Error(`You can't supply multiple values for '${property}'.`);
    }
    return true;
  }

  const bannedAggNames = { key: true, doc_count: true, count: true };

  function assertAggNameIsAllowed(aggName, supplimentalBanList) {
    if (bannedAggNames[aggName]) {
      throw new Error(`You're not allowed to use '${aggName}' as an aggregation name.`);
    }
    if (supplimentalBanList[aggName]) {
      throw new Error(`You can't use '${aggName}' as an aggregation name multiple times!`);
    }
  }

  // returns an array of all protected aggregationFields
  function getAggregationFields(query, aggParam, supplimentalBanList) {
    let retVal = [];
    const _aggParam = aggParam || 'aggregations';

    if (!query[_aggParam]) {
      return retVal;
    }
    const _supplimentalBanList = supplimentalBanList || {};

    _.each(query[_aggParam].split(','), (agg) => {
      assertAggNameIsAllowed(agg, _supplimentalBanList);
      _supplimentalBanList[agg] = true;
      let _type = query[`${agg}.type`];
      !_type && (_type = 'terms');
      const aggOptions = permittedAggOptions[_type];
      _.each(aggOptions, (aggOption) => {
        const expectedOptionName = `${agg}.${aggOption}`;
        retVal.push(expectedOptionName);
      });

      if (query[`${agg}.aggregations`]) {
        const nestedAggFields = getAggregationFields(query, `${agg}.aggregations`, _supplimentalBanList);
        retVal = retVal.concat(nestedAggFields);
      }
    });
    return retVal;
  }

  function getAggregationObjects(query, aggParam) {
    const _aggParam = aggParam || 'aggregations';

    if (!query[_aggParam]) {
      return [];
    }

    return _.map(query[_aggParam].split(','), (agg) => {
      const aggregation = {};

      setValueIfExists(aggregation, 'name', agg, assertIsNotArray);
      setValueIfExists(aggregation, 'property', query[`${agg}.property`], assertIsNotArray);
      setValueIfExists(aggregation, 'type', query[`${agg}.type`] || 'terms', assertIsNotArray);
      setValueIfExists(aggregation, 'maxSamples', query[`${agg}.maxSamples`], assertIsNotArray);
      setValueIfExists(aggregation, 'order', query[`${agg}.order`], assertIsNotArray);
      setValueIfExists(aggregation, 'sort', query[`${agg}.sort`], assertIsNotArray);
      setValueIfExists(aggregation, 'limit', query[`${agg}.limit`], assertIsNotArray);
      setValueIfExists(aggregation, 'fields', query[`${agg}.fields`], assertIsNotArray);
      setValueIfExists(aggregation, 'include', query[`${agg}.include`], assertIsNotArray);
      setValueIfExists(aggregation, 'sigma', query[`${agg}.sigma`], assertIsNotArray);
      setValueIfExists(aggregation, 'interval', query[`${agg}.interval`], assertIsNotArray);
      setValueIfExists(aggregation, 'timezone', query[`${agg}.timezone`], assertIsNotArray);
      setValueIfExists(aggregation, 'offset', query[`${agg}.offset`], assertIsNotArray);
      setValueIfExists(aggregation, 'ranges', query[`${agg}.ranges`], assertIsNotArray);

      if (query[`${agg}.aggregations`]) {// TODO: also, if type allows nesting (aka, type is a bucket aggregation)
        aggregation.aggregations = getAggregationObjects(query, `${agg}.aggregations`);
      }

      return aggregation;
    });
  }

  // HarvestRoute is used to appendLinks & appendLinked.
  this.setHarvestRoute = function setHarvestRoute(harvestRoute) {
    this.harvestRoute = harvestRoute;
  };

  // Note that this is not currently named well - it also provides the "includes" functionality to top_hits.
  function getTopHitsResult(aggResponse, aggName, esResponse, aggregationObjects) {
    const aggLookup = {};
    const linked = {}; // keeps track of all linked objects. type->id->true
    const typeLookup = {};

    function getAggLookup(_aggLookup, _aggregationObjects) {
      _.each(_aggregationObjects, (aggObj) => {
        _aggLookup[aggObj.name] = aggObj;
        aggObj.aggregations && getAggLookup(_aggLookup, aggObj.aggregations);
      });
    }

    getAggLookup(aggLookup, aggregationObjects);

    // dedupes already-linked entities.
    if (aggLookup[aggName] && aggLookup[aggName].include) {
      _.each(aggLookup[aggName].include.split(','), (linkProperty) => {
        if (_this.collectionLookup[linkProperty]) {
          const _type = inflect.pluralize(_this.collectionLookup[linkProperty]);
          typeLookup[linkProperty] = _type;

          esResponse.linked && _.each(esResponse.linked[_type] || [], (resource) => {
            linked[_type] = linked[_type] || {};
            linked[_type][resource.id] = true;
          });
        }
      });
    }

    return _.map(aggResponse.hits.hits, (esReponseObj) => {
      if (aggLookup[aggName] && aggLookup[aggName].include) {
        _.each(aggLookup[aggName].include.split(','), (linkProperty) => {
          if (typeLookup[linkProperty]) {
            const _type = typeLookup[linkProperty];

            // if this isn't already linked, link it.
            // TODO: links may be an array of objects, so treat it that way at all times.
            const hasLinks = !!(esReponseObj._source.links) && !!(esReponseObj._source.links[linkProperty]);
            if (hasLinks) {
              const entitiesToInclude = [].concat(unexpandSubentity(esReponseObj._source.links[linkProperty]));

              _.each(entitiesToInclude, (entityToInclude) => {
                const entityIsAlreadyIncluded = !!(linked[_type]) && !!(linked[_type][entityToInclude.id]);
                if (!entityIsAlreadyIncluded) {
                  esResponse.linked = esResponse.linked || {};
                  esResponse.linked[_type] = esResponse.linked[_type] || [];

                  esResponse.linked[_type] = esResponse.linked[_type].concat(entityToInclude);
                  linked[_type] = linked[_type] || {};
                  linked[_type][entityToInclude.id] = true;
                }
              });
            }
          } else {
            console.warn(`[Elastic-Harvest] ${linkProperty} is not in collectionLookup. ${linkProperty} was either ` +
              'incorrectly specified by the end-user, or dev failed to include the relevant key in the lookup ' +
              'provided to initialize elastic-harvest.');
          }
        });
      }

      return unexpandEntity(esReponseObj._source);
    });
  }

  function sendSearchResponse(esResults, req, res, includes, fields, aggregationObjects) {
    const initialPromise = Promise.resolve();
    let padding = undefined;
    (process.env.NODE_ENV !== 'production') && (padding = 2);

    return initialPromise.then(() => {
      const esResponseArray = getResponseArrayFromESResults(esResults, fields);
      let esResponse = {};

      esResponse[type] = esResponseArray;
      _this.harvestRoute.appendLinked(esResponse, includes)
        .then((_esResponse) => {
          // Add in meta.aggregations field
          function createBuckets(terms) {
            return _.map(terms, (term) => {
              // 1. see if there are other terms & if they have buckets.
              const retVal = { key: term.key, count: term.doc_count };

              _.each(term, (aggResponse, responseKey) => {
                if (responseKey === 'key' || responseKey === 'doc_count') {
                  return null;
                } else if (aggResponse.buckets) {
                  retVal[responseKey] = createBuckets(aggResponse.buckets);
                } else if (aggResponse.hits && aggResponse.hits.hits) {
                  // top_hits aggs result from nested query w/o reverse nesting.
                  retVal[responseKey] = getTopHitsResult(aggResponse, responseKey, _esResponse, aggregationObjects);
                  // to combine nested aggs w others, you have to un-nest them, & this takes up an aggregation-space.
                } else if (responseKey !== 'reverse_nesting' && aggResponse) { // stats & extended_stats aggs
                  // This means it's the result of a nested stats or extended stats query.
                  if (aggResponse[responseKey]) {
                    retVal[responseKey] = aggResponse[responseKey];
                  } else {
                    retVal[responseKey] = aggResponse;
                  }
                } else if (responseKey === 'reverse_nesting') {
                  _.each(aggResponse, (reverseNestedResponseProperty, reverseNestedResponseKey) => {
                    if (reverseNestedResponseKey === 'doc_count') {
                      return null;
                    } else if (reverseNestedResponseProperty.buckets) {
                      retVal[reverseNestedResponseKey] = createBuckets(reverseNestedResponseProperty.buckets);
                      // this gets a little complicated because reverse-nested then renested subdocuments are ..
                      // complicated (because the extra aggs for nesting throws things off).
                    } else if (reverseNestedResponseProperty[reverseNestedResponseKey] &&
                        reverseNestedResponseProperty[reverseNestedResponseKey].buckets) {
                      retVal[reverseNestedResponseKey] = createBuckets(
                        reverseNestedResponseProperty[reverseNestedResponseKey].buckets);

                      // this gets a little MORE complicated because of reverse-nested then renested top_hits aggs
                    } else if (reverseNestedResponseProperty.hits && reverseNestedResponseProperty.hits.hits) {
                      retVal[reverseNestedResponseKey] = getTopHitsResult(reverseNestedResponseProperty,
                        reverseNestedResponseKey, _esResponse, aggregationObjects);

                      // stats & extended_stats aggs
                    } else if (reverseNestedResponseProperty) {
                      // This means it's the result of a nested stats or extended stats query.
                      if (reverseNestedResponseProperty[reverseNestedResponseKey]) {
                        retVal[reverseNestedResponseKey] = reverseNestedResponseProperty[reverseNestedResponseKey];
                      } else {
                        retVal[reverseNestedResponseKey] = reverseNestedResponseProperty;
                      }
                    }
                    return null;
                  });
                }
                return null;
              });

              return retVal;
            });
          }

          function createAggregations(_esResults, __esResponse, _aggregationObjects) {
            const meta = {
              aggregations: {
              }
            };
            _.forIn(_esResults.aggregations, (value, key) => {
              if (value.buckets) {
                // simple terms agg
                meta.aggregations[key] = createBuckets(value.buckets);
              } else if (value[key] && value[key].buckets) {
                // nested terms agg
                meta.aggregations[key] = createBuckets(value[key].buckets);
              } else if (value.hits && value.hits.hits) {
                // top_hits aggs result from totally un-nested query
                meta.aggregations[key] = getTopHitsResult(value, key, __esResponse, _aggregationObjects);
                // __esResponse is what gets retuend so modify linked in that.
              } else if (value) {
                // stats & extended_stats aggs
                if (value[key]) {
                  // This means it's the result of a nested stats or extended stats query.
                  meta.aggregations[key] = value[key];
                } else {
                  meta.aggregations[key] = value;
                }
              }
            });
            return meta;
          }

          if (esResults && esResults.aggregations) {
            _esResponse.meta = createAggregations(esResults, _esResponse, aggregationObjects);
          }

          // Add in meta.geo_distance
          if (esResults && esResults.hits && esResults.hits.hits && esResults.hits.hits[0] &&
            esResults.hits.hits[0].fields && esResults.hits.hits[0].fields.distance) {
            _esResponse.meta = _esResponse.meta || {};
            _esResponse.meta.geo_distance = {};
            _.each(esResults.hits.hits, (hit) => {
              const distance = hit.fields.distance[0];
              const objId = hit._id;
              const _type = hit._type;
              _esResponse.meta.geo_distance[_type] = _esResponse.meta.geo_distance[_type] || {};
              _esResponse.meta.geo_distance[_type][objId] = distance;
            });
          }

          return res
            .set('content-type', 'application/vnd.api+json') // todo set jsonapi ct
            .status(200)
            .send(JSON.stringify(_this.harvestRoute.appendLinks(_esResponse), undefined, padding));
        }, (error) => {
          console.warn(error && error.stack || error);
          esResponse = _this.harvestRoute.appendLinks(esResponse);

          return res
            .set('content-type', 'application/vnd.api+json') // todo set jsonapi ct
            .status(400)
            .send(JSON.stringify(esResponse, undefined, padding));
        });
    }).catch((error) => {
      console.error(error && error.stack || error);
      sendError(req, res, new JsonApiError({ status: 500 }));
    });
  }

  /**
   * Creates a custom routing query string parameter when provided with the pathToCustomRoutingKey and a map of query
   * string parameters, it will create a custom routing query string parameter, that can be sent to elasticSearch. It
   * return an empty string if it is unable to create one.
   *
   * It will validate:
   *   * that custom routing is turned on for this type.
   *   * the value to be used for custom routing is a string
   *   * the string doesn't end with wildcards
   *   * the string doesnt' have operators like ge, gt, le or lt
   *
   * @param pathToCustomRoutingKey  string, the path to the custom routing key
   * @param query                   map, of query strings from the request
   * @returns string                custom routing query string or '' if N/A
   */
  function createCustomRoutingQueryString(pathToCustomRoutingKey, query) {
    const invalidRegexList = [/^ge=/, /^gt=/, /^ge=/, /^lt=/, /\*$/]; // array of invalid regex
    let customRoutingValue;

    if (!pathToCustomRoutingKey) return ''; // customRouting is not enabled for this type
    customRoutingValue = query[pathToCustomRoutingKey]; // fetch the value

    // filters like [ 'gt: '10', lt: '20' ] are not valid customRouting values but may show up
    if (typeof customRoutingValue !== 'string') return '';

    // check for range and wildcard filters
    _.forEach(invalidRegexList, (invalidRegex) => {
      // if our value matches one of these regex, it's probably not the value we should be hashing for customRouting
      if (invalidRegex.test(customRoutingValue)) {
        customRoutingValue = '';
        return false;
      }
      return true;
    });

    return customRoutingValue ? `routing=${customRoutingValue}` : '';
  }

  function esSearch(esQuery, aggregationObjects, req, res) {
    const query = req.query;
    const customRoutingQuery = createCustomRoutingQueryString(_this.pathToCustomRoutingKey, query);
    const params = [];

    customRoutingQuery && params.push(customRoutingQuery);
    query.include && params.push(`include=${query.include}`);
    query.limit && params.push(`size=${query.limit}`);
    query.offset && params.push(`from=${query.offset}`);

    const queryStr = `?${params.join('&')}`;
    const esResource = `${esUrl}/${index}/${type}/_search${queryStr}`;

    let searchPromise = $http({ url: esResource, method: 'GET', body: esQuery });

    if (query.script === 'sampler') {
      searchPromise = SampleScript.sample(index, type, esQuery, aggregationObjects, query, esResource);
    }

    searchPromise.spread((response) => {
      let esResults;
      // let error;
      response && response.body && (esResults = JSON.parse(response.body));
      if (!esResults) {
        throw new Error('There was no response from the server.');
      } else if (esResults.error) {
        // esResults.error && (error = esResults.error);
        throw new Error('Your query was malformed, so it failed. Please check the api to make sure you\'re using it ' +
          'correctly.');
      } else {
        let includes = req.query.include;
        let fields = req.query.fields;

        includes && (includes = includes.split(','));
        fields && (fields = fields.split(','));
        fields && fields.push('id'); // id field is required.

        return sendSearchResponse(esResults, req, res, includes, fields, aggregationObjects);
      }
    })
      .catch((err) => {
        err.body && console.log('[Elastic-Harvest] Error description: ', err.body);
        console.log('[Elastic-Harvest] Error stack: ', err.stack);
        const error = new JsonApiError({
          status: 400,
          detail: 'Your query was malformed, so it failed. Please check the api to make sure you\'re using it ' +
          'correctly.'
        });
        sendError(req, res, error);
      });
  }

  return this;
}


const requiredAggOptions = {
  top_hits: ['type'],
  terms: ['type', 'property'],
  stats: ['type', 'property'],
  extended_stats: ['type', 'property'],
  date_histogram: ['type', 'property', 'interval'],
  range: ['type', 'property', 'ranges']
};


function assertAggregationObjectHasRequiredOptions(aggregationObject) {
  const type = aggregationObject.type || 'terms';

  _.each(requiredAggOptions[type], (requiredOption) => {
    Util.assertAsDefined(aggregationObject[requiredOption], `${type} aggregations require that a '${requiredOption}' ` +
      'paramenter is specified.');
  });
}


const esDistanceFunctionLookup = {
  mi: 'arcDistanceInMiles',
  miles: 'arcDistanceInMiles',
  km: 'arcDistanceInKm',
  kilometers: 'arcDistanceInKm',
  m: 'arcDistance',
  meters: 'arcDistance'
};


/**
 * Transforms an expanded ES source object to an unexpanded object
 */
function unexpandEntity(sourceObject, includeFields) {
  _.each(sourceObject.links || [], (val, key) => {
    if (!_.isArray(sourceObject.links[key])) {
      // I know the extra .toString seems unnecessary, but sometimes val.id is already an objectId, and other times its
      // a string.
      sourceObject.links[key] = val.id && val.id.toString() || val && val.toString && val.toString();
    } else {
      _.each(sourceObject.links[key], (innerVal, innerKey) => {
        sourceObject.links[key][innerKey] = innerVal.id.toString();
      });
    }
  });

  return (includeFields && includeFields.length) ? Util.includeFields(sourceObject, includeFields) : sourceObject;
}


/**
 * A sub-entity is a linked object returned by es as part of the source graph. They are expanded differently from
 * primary entities, and must be unexpanded differently as well.
 */
function unexpandSubentity(subEntity) {
  if (_.isArray(subEntity)) {
    _.each(subEntity, (entity, index) => {
      subEntity[index] = unexpandSubentity(entity);
    });
  } else {
    _.each(subEntity, (val, propertyName) => {
      if (_.isObject(val) && val.id) {
        subEntity.links = subEntity.links || {};
        subEntity.links[propertyName] = val.id;
        delete subEntity[propertyName];
      }
    });
  }

  return subEntity;
}


function getResponseArrayFromESResults(results, fields) {
  const retVal = [];

  if (results && results.hits && results.hits.hits) {
    _.each(results.hits.hits, (hit) => {
      retVal.push(unexpandEntity(hit._source, fields));
    });
  }

  return retVal;
}


ElasticHarvest.prototype.setPathToCustomRoutingKey = function setPathToCustomRoutingKey(pathToCustomRoutingKey) {
  if (typeof pathToCustomRoutingKey !== 'string' || pathToCustomRoutingKey === '') {
    throw new Error('pathToCustomRoutingKey must be a non empty string');
  }
  this.pathToCustomRoutingKey = pathToCustomRoutingKey;

  return this; // so we can chain it
};


ElasticHarvest.prototype.getEsQueryBody = function getEsQueryBody(predicates, nestedPredicates, geoPredicate,
  aggregationObjects, sortParams) {
  const operatorMap = {
    lt: 'lt',
    le: 'lte',
    gt: 'gt',
    ge: 'gte'
  };

  function createEsQueryFragment(field, value) {
    let fragment;
    let actualValue;
    let operator;
    let isNotMatchQuery;

    // ToDo: add "lenient" to support queries against numerical values.
    // Handle range queries (lt, le, gt, ge) differently.
    if (value.indexOf('=') !== -1) {
      actualValue = value.substr(3);
      operator = operatorMap[value.substr(0, 2)];
      fragment = { query: { range: {} } };
      fragment.query.range[field] = {};
      fragment.query.range[field][operator] = actualValue;
    } else if (value.indexOf('*') !== -1) {
      fragment = { query: { wildcard: {} } };
      fragment.query.wildcard[field] = value;
    } else {
      if (_.isArray(value)) {
        // see if values are range queries
        _.each(value, (innerFieldValue) => {
          if (innerFieldValue.indexOf('=') !== -1) {
            actualValue = innerFieldValue.substr(3);
            operator = operatorMap[innerFieldValue.substr(0, 2)];
            fragment = fragment || { query: { range: {} } };
            fragment.query.range[field] = fragment.query.range[field] || {};
            fragment.query.range[field][operator] = actualValue;
            isNotMatchQuery = true;
          }
        });
        if (isNotMatchQuery) return fragment;
      }
      let val = value.replace(/,/g, ' ');
      if (value.indexOf(',') > -1) {
        const chunks = value.split(',');
        val = {
          should: chunks.map((chunk) => {
            const match = {};
            match[field] = chunk;
            return { match };
          })
        };

        fragment = { query: { bool: {} } };
        fragment.query.bool = val;
      } else {
        fragment = { query: { match: {} } };
        fragment.query.match[field] = { query: val, lenient: true };
      }
    }

    return fragment;
  }

  /**
   * Groups predicates at their lowest match level to simplify creating nested queries
   */
  function groupNestedPredicates(_nestedPredicates) {
    let maxDepth = 0;
    const nestedPredicateObj = {};
    const nestedPredicateParts = _.map(_nestedPredicates, (predicateArr) => {
      const predicate = predicateArr[0];
      const retVal = predicate.split('.');
      nestedPredicateObj[predicate] = predicateArr[1];
      retVal.length > maxDepth && (maxDepth = retVal.length);
      return retVal;
    });
    const groups = {};

    for (let i = 0; i < maxDepth; i++) {
      groups[i] = _.groupBy(nestedPredicateParts, (predicateParts) => {
        let retval = '';
        for (let j = 0; j < i + 1; j++) {
          retval += (predicateParts[j] ? `${predicateParts[j]}.` : '');
        }
        return retval.substr(0, retval.length - 1);
      });
    }

    const completed = {};
    const levels = {};
    const paths = {};

    // Simplifies the grouping
    for (let i = maxDepth - 1; i >= 0; i--) {
      _.each(groups[i], (values, key) => {
        _.each(values, (value) => {
          const strKey = value.join('.');
          if (!completed[strKey] && values.length > 1) {
            (!levels[i] && (levels[i] = []));
            levels[i].push(strKey);
            (completed[strKey] = true);
            paths[i] = key;
          }
          if (!completed[strKey] && i < 1) {
            (!levels[i] && (levels[i] = []));
            levels[i].push(strKey);
            (completed[strKey] = true);
            paths[i] = key;
          }
        });
      });
    }

    return { groups: levels, paths, nestedPredicateObj };
  }

  function createNestedPredicateFragment(grouping) {
    const _basicQuery = _.map(grouping.groups, (group, index) => {
      // add basic terms, then for each predicate in the level group add extra terms.
      const path = grouping.paths[index];
      const qObj = {
        nested: {
          path,
          query: {
            bool: {
              must: []
            }
          }
        }
      };

      _.each(group, (groupling) => {
        const value = grouping.nestedPredicateObj[groupling];
        const key = groupling;
        const localPath = groupling.substr(0, groupling.lastIndexOf('.'));
        const matchObj = createEsQueryFragment(key, value).query;

        if (localPath === path) {
          qObj.nested.query.bool.must.push(matchObj);
        } else {
          qObj.nested.query.bool.must.push({
            nested: {
              path: localPath,
              query: matchObj
            }
          });
        }
      });

      return qObj;
    });

    function isExpandableQuery(basicQuery) {
      let retVal = false;
      _.each(basicQuery, (query) => {
        retVal = retVal || isAlongExpandableQueryLine(query);
      });

      return retVal;
    }

    function getMatchQuery(innerQuery) {
      if (innerQuery.match) {
        return innerQuery.match;
      } else if (innerQuery.nested && innerQuery.nested.query && innerQuery.nested.query.match) {
        return innerQuery.nested.query.match;
      }

      return false;
    }

    function getRangeQuery(innerQuery) {
      if (innerQuery.range) {
        return innerQuery.range;
      } else if (innerQuery.nested && innerQuery.nested.query && innerQuery.nested.query.range) {
        return innerQuery.nested.query.range;
      }

      return false;
    }

    function isAlongExpandableQueryLine(query) {
      let retVal = false;
      _.each(query.nested.query.bool.must, (innerQuery) => {
        const matchObj = getMatchQuery(innerQuery);

        if (matchObj) {
          const values = _.values(matchObj);
          if (_.isArray(values[0])) {
            retVal = true;
          }
        } else {
          getRangeQuery(innerQuery);
          retVal = false;
        }
      });

      return retVal;
    }

    /**
     * Handles the case where multiple values are submitted for one key
     * This transforms a query that tries to match something like {match:{links.husband.name:["Peter","Solomon"]} to
     * one that instead duplicates all parts of the query and splits it so each match term has it's own search query.
     * This was done so searches would not be unduely limited by the nested level.
     */
    function getExpandedQuery(basicQuery) {
      let expandedQuery = [];
      const needsExpandedQuery = isExpandableQuery(basicQuery);

      if (!needsExpandedQuery) {
        expandedQuery = basicQuery;
      } else {
        _.each(basicQuery, (query, i) => {
          let thisNonExpandableQueryWasAlreadyCloned = false;
          const isExpandableQueryLine = isAlongExpandableQueryLine(query);
          _.each(query.nested.query.bool.must, (innerQuery, mustI) => {
            const matchObj = innerQuery.nested.query.match;
            const values = _.values(matchObj);
            if (values.length > 1) {
              console.warn('[Elastic-Harvest] Our match query isn\'t supposed to have multiple keys in it. We expect ' +
                'something like { match: { name: "Peter " } }, and you\'ve constructed a match like { match: { name: ' +
                '"Peter", type: "person" } }');
              throw Error('The query expansion algorithm does not expect this query form.');
            }
            if (_.isArray(values[0])) {
              _.each(values[0], (value) => {
                const key = _.keys(matchObj)[0];
                const newQuery = _.cloneDeep(basicQuery);
                const relatedMatchObj = newQuery[i].nested.query.bool.must[mustI].nested.query.match;
                relatedMatchObj[key] = value;
                expandedQuery.push(newQuery[i]);
              });
            } else if (!isExpandableQueryLine && !thisNonExpandableQueryWasAlreadyCloned) {
              // the only queries that get cloned are the ones on the query line of the expanded query.
              expandedQuery.push(basicQuery[i]);
              thisNonExpandableQueryWasAlreadyCloned = true;
            }
          });
        });
      }

      return expandedQuery;
    }

    const expandedQuery = getExpandedQuery(_basicQuery);
    if (expandedQuery === _basicQuery) {
      return expandedQuery;
    } else if (isExpandableQuery(expandedQuery)) {
      return getExpandedQuery(expandedQuery);
    }
    return expandedQuery;
  }
  const nestedPredicatesESFragment = createNestedPredicateFragment(groupNestedPredicates(nestedPredicates));

  function createGeoPredicateESFragment(_geoPredicate) {
    return {
      geo_distance: {
        distance: _geoPredicate.distance,
        location: [Number(_geoPredicate.lon), Number(_geoPredicate.lat)]
      }
    };
  }

  let predicatesESFragment = _.map(predicates, (predicate) => {
    const key = predicate.key;
    const value = predicate.value;

    // Handles the case where multiple values are submitted for one key
    if (_.isArray(value)) {
      const retVal = [];
      _.each(value, (val) => {
        retVal.push(createEsQueryFragment(key, val));
      });
      return retVal;
    }
    return createEsQueryFragment(key, value);
  });
  predicatesESFragment = _.flatten(predicatesESFragment);
  const geoPredicateExists = (Object.keys(geoPredicate).length > 2);
  geoPredicateExists && predicatesESFragment.push(createGeoPredicateESFragment(geoPredicate));
  const allPredicateFragments = nestedPredicatesESFragment.concat(predicatesESFragment);
  const filter = {
    and: allPredicateFragments
  };
  const composedESQuery = {
    query: {
      filtered: {
        query: { match_all: {} }
      }
    }
  };

  if (predicates.length) {
    // If filtered query has only filter defined then scoring is off,
    // so create query_string query as sub part of filtered query to enable result scoring.
    const mappedPredicates = _.reduce(predicates, (result, item) => {
      // Skip all predicates that are functions or contain special characters, i.e. "=" to filter out stuff like
      // ?speed=gt=1 which will go to filter anyway and does not influence scoring
      if (!item.value || !(item.value.match instanceof Function) || item.value.match(/[^a-zA-Z0-9-_ ]/)) {
        return result;
      }
      const value = item.value.replace(/[^a-zA-Z0-9-_ ]/g, '');
      if (value) {
        return `${result + (result ? ' AND ' : ' ')}(${item.key}:${value})`;
      }

      return result;
    }, '');
    if (mappedPredicates.trim().length) {
      // Apply query_string query only if anything meaningful to such query is found in predicates
      composedESQuery.query.filtered.query = { query_string: { query: mappedPredicates } };
    }
  }

  allPredicateFragments.length > 0 && (composedESQuery.query.filtered.filter = filter);

  function addInDefaultAggregationQuery(aggs, aggregationObject, extraShallowValues) {
    // Todo: stop crash if no field is provided, or crash more elegantly.
    const isDeepAggregation = (aggregationObject.property.lastIndexOf('.') > 0);
    const path = aggregationObject.property.substr(0, aggregationObject.property.lastIndexOf('.'));
    const shallowAggs = {};

    shallowAggs[aggregationObject.type] = {
      field: aggregationObject.property
    };
    _.each(extraShallowValues || [], (extraShallowValue, extraShallowKey) => {
      shallowAggs[aggregationObject.type][extraShallowKey] = extraShallowValue;
    });

    // deep work should be repeated.
    if (isDeepAggregation) {
      aggs[aggregationObject.name] = {
        nested: {
          path
        },
        aggs: {}
      };
      aggs[aggregationObject.name].aggs[aggregationObject.name] = shallowAggs;
    } else {
      aggs[aggregationObject.name] = shallowAggs;
    }

    return isDeepAggregation;
  }

  function getAggregationQuery(_aggregationObjects) {
    const aggs = {};

    _.each(_aggregationObjects || [], (aggregationObject) => {
      assertAggregationObjectHasRequiredOptions(aggregationObject);
      let isDeepAggregation = false;
      if (aggregationObject.type === 'terms') {
        isDeepAggregation = addInDefaultAggregationQuery(aggs, aggregationObject, {
          size: aggregationObject.limit || DEFAULT_AGGREGATION_LIMIT
        });
      } else if (aggregationObject.type === 'top_hits') {
        const shallowAggs = {
          top_hits: {
            size: aggregationObject.limit ? Number(aggregationObject.limit) : DEFAULT_TOP_HITS_AGGREGATION_LIMIT
          }
        };

        // Adds in sorting
        if (aggregationObject.sort) {
          _.each(aggregationObject.sort.split(','), (sortParam) => {
            const sortDirection = (sortParam[0] !== '-' ? 'asc' : 'desc');
            const _sortParam = (sortDirection === 'desc') ? sortParam.substr(1) : sortParam;
            shallowAggs.top_hits.sort = shallowAggs.top_hits.sort || [];
            const sortTerm = {};
            const lastDot = _sortParam.lastIndexOf('.');
            const sortField = _sortParam;
            if (lastDot !== -1) {
              const nestedPath = _sortParam.substring(0, lastDot);
              sortTerm[sortField] = { order: sortDirection, nested_path: nestedPath, ignore_unmapped: true };
            } else {
              sortTerm[sortField] = { order: sortDirection, ignore_unmapped: true };
            }
            shallowAggs.top_hits.sort.push(sortTerm);
          });
        }
        if (aggregationObject.fields) {
          shallowAggs.top_hits._source = {};
          shallowAggs.top_hits._source.include = aggregationObject.fields.split(',');
        }
        aggs[aggregationObject.name] = shallowAggs;
      } else if (aggregationObject.type === 'extended_stats' && aggregationObject.sigma) {
        isDeepAggregation = addInDefaultAggregationQuery(aggs, aggregationObject, {
          sigma: parseFloat(aggregationObject.sigma)
        });
      } else if (aggregationObject.type === 'stats' || aggregationObject.type === 'extended_stats') {
        isDeepAggregation = addInDefaultAggregationQuery(aggs, aggregationObject);
      } else if (aggregationObject.type === 'date_histogram') {
        const extraOptions = { interval: aggregationObject.interval };
        aggregationObject.timezone && (extraOptions.time_zone = aggregationObject.timezone);
        extraOptions.min_doc_count = 1;
        aggregationObject.offset && (extraOptions.offset = aggregationObject.offset);
        isDeepAggregation = addInDefaultAggregationQuery(aggs, aggregationObject, extraOptions);
      } else if (aggregationObject.type === 'range') {
        const ranges = aggregationObject.ranges.split(',');
        const rangeOptions = { ranges: [] };
        _.each(ranges, (range) => {
          // Extracts from and to from strings like "*-50" or "44-76"
          const rangeObject = {};
          const dashLocation = range.indexOf('-');
          // validates that this dashLocation is appropriate
          if (dashLocation === 0) {
            throw new Error(`The range aggregation requires that your ${range} range have a "from" value. To remove ` +
            'the lower limit, use an * as your "from" value. e.g. *-44');
          } else if (dashLocation === range.length - 1) {
            throw new Error(`The range aggregation requires that your ${range} range have a 'to' value. To remove ` +
            'the upper limit, use an * as your "to" value. e.g. 0-*');
          } else if (dashLocation === -1) {
            throw new Error(`The range aggregation requires that your ${range} range have a '-' in it. e.g. 0-50`);
          }
          rangeObject.from = range.substring(0, dashLocation);
          rangeObject.to = range.substring(dashLocation + 1, range.length);
          (rangeObject.from === '*') && (delete rangeObject.from);
          (rangeObject.to === '*') && (delete rangeObject.to);

          rangeOptions.ranges.push(rangeObject);
        });

        isDeepAggregation = addInDefaultAggregationQuery(aggs, aggregationObject, rangeOptions);
      }

      if (aggregationObject.aggregations) {
        const furtherAggs = getAggregationQuery(aggregationObject.aggregations);
        let relevantAggQueryObj = aggs[aggregationObject.name];

        if (isDeepAggregation) {
          // TODO:this should not be an equals; you may overwrite an agg here!
          aggs[aggregationObject.name].aggs[aggregationObject.name].aggs = { reverse_nesting: { reverse_nested: {} } };
          relevantAggQueryObj = aggs[aggregationObject.name].aggs[aggregationObject.name].aggs.reverse_nesting;
        }
        if (!relevantAggQueryObj.aggs) {
          relevantAggQueryObj.aggs = furtherAggs;
        } else {
          _.each(furtherAggs, (furtherAgg, key) => {
            relevantAggQueryObj.aggs[key] = furtherAgg;
          });
        }
      }
    });

    return aggs;
  }

  composedESQuery.aggs = getAggregationQuery(aggregationObjects);
  if (geoPredicateExists) {
    geoPredicate.unit = geoPredicate.distance.replace(/\d+/g, '');
    const distanceFunction = esDistanceFunctionLookup[geoPredicate.unit];

    if (distanceFunction) {
      composedESQuery.script_fields = composedESQuery.script_fields || {};
      composedESQuery.script_fields.distance = {
        params: {
          lat: Number(geoPredicate.lat),
          lon: Number(geoPredicate.lon)
        },
        script: `doc[\u0027location\u0027].${distanceFunction}(lat,lon)`
      };
      composedESQuery.fields = ['_source'];
    }
  }

  if (sortParams) {
    composedESQuery.sort = [];
    _.each(sortParams, (sortParam) => {
      const sortTerm = {};
      const sortDirection = (sortParam[0] !== '-' ? 'asc' : 'desc');
      const _sortParam = (sortDirection === 'desc') ? sortParam.substr(1) : sortParam;

      if (Util.hasDotNesting(_sortParam)) {
        // nested sort
        sortTerm[_sortParam] = { order: sortDirection, ignore_unmapped: true, nested_path: _sortParam.substring(0,
          _sortParam.lastIndexOf('.')) };
      } else if (_sortParam === 'distance') {
        if (geoPredicateExists) {
          sortTerm._geo_distance = {
            location: [Number(geoPredicate.lon), Number(geoPredicate.lat)],
            order: sortDirection,
            unit: geoPredicate.unit.toLowerCase(),
            mode: 'min',
            distance_type: 'sloppy_arc'
          };
        }
      } else {
        sortTerm[_sortParam] = { order: sortDirection, ignore_unmapped: true }; // normal, simple sort
      }
      composedESQuery.sort.push(sortTerm);
    });
  }

  return JSON.stringify(composedESQuery);
};


ElasticHarvest.prototype.enableAutoIndexUpdate = function enableAutoIndexUpdate() {
  const _this = this;
  _.each(this.autoUpdateInput, (autoUpdateValue, autoUpdateKey) => {
    _this.enableAutoIndexUpdateOnModelUpdate(autoUpdateValue, autoUpdateKey);
  });
};


ElasticHarvest.prototype.enableAutoIndexUpdateOnModelUpdate = function enableAutoIndexUpdateOnModelUpdate(
  endpoint, idField) {
  const _this = this;

  function resourceChanged(resourceId) {
    console.log(`[Elastic-Harvest] Syncing Change @${idField} : ${resourceId}`);

    return _this.updateIndexForLinkedDocument(idField, { id: resourceId.toString() })
      .catch((error) => {
        // This sort of error will not be solved by retrying it a bunch of times.
        console.warn(error && error.stack || error);
      });
  }

  if (!!this.harvest_app.options.oplogConnectionString) {
    console.warn(`[Elastic-Harvest] Will sync ${endpoint} data via oplog`);
    this.harvest_app.onChange(endpoint, { insert: resourceChanged, update: resourceChanged, delete: resourceChanged,
      asyncInMemory: _this.options.asyncInMemory });
  } else {
    console.warn(`[Elastic-Harvest] Will sync  ${endpoint} data via harvest.after`);
    this.harvest_app.after(endpoint, function handler(req) {
      const entity = this;
      if ((_.contains(['POST', 'PUT'], req.method)) && entity.id) {
        return _this.updateIndexForLinkedDocument(idField, entity);
      }
      return entity;
    });
  }
};


/**
 * Searches elastic search at idField for entity.id & triggers a reindex. If method is DELETE, it'll
 * handle the update specially, otherwise, you can ignore that param. Note that the delete param expects
 * that the idField ends in .id.
 */
ElasticHarvest.prototype.updateIndexForLinkedDocument = function updateIndexForLinkedDocument(idField, entity) {
  const _this = this;

  return _this.simpleSearch(idField, entity.id)
    .then((result) => {
      return _this.expandAndSync(_.map(result.hits.hits, (hit) => {
        return unexpandEntity(hit._source);
      })).then(() => {
        return entity;
      });
    });
};


/**
 * Takes a search predicate (or nested predicate) field & value and returns a promise for corresponding models.
 */
ElasticHarvest.prototype.simpleSearch = function simpleSearch(field, value) {
  const predicates = [];
  const nestedPredicates = [];

  if (field.indexOf('.') === -1) {
    const predicate = {};
    predicate[field] = value;
    predicates.push(predicate);
  } else {
    const nestedPredicate = [field, value];
    nestedPredicates.push(nestedPredicate);
  }
  const reqBody = this.getEsQueryBody(predicates, nestedPredicates, {}, [], undefined);
  const params = [];
  params.push(`size=${DEFAULT_SIMPLE_SEARCH_LIMIT}`);
  const queryStr = `?${params.join('&')}`;
  const esResource = `${this.es_url}/${this.index}/${this.type}/_search${queryStr}`;

  return requestAsync({ uri: esResource, method: 'GET', body: reqBody }).then((response) => {
    const esResults = JSON.parse(response[1]);
    if (esResults.error) {
      console.log('[Elastic-Harvest] Error', esResults.error);
      throw new Error('Your query was malformed, so it failed. Please check the api to make sure you\'re using it ' +
        'correctly.');
    } else {
      return esResults;
    }
  });
};


/**
 * delete: Just deletes the #id item of the initialized type.
 */
ElasticHarvest.prototype.delete = function _delete(id) {
  const _this = this;
  const esResource = `${this.es_url}/${this.index}/${this.type}/${id}`;
  console.log(`[Elastic-Harvest] Deleting ${_this.type}/${id}`);

  return requestAsync({ uri: esResource, method: 'DELETE', body: '' }).then((response) => {
    const body = JSON.parse(response[1]);
    if (!body.found) {
      throw new Error(`Could not find ${_this.type} ${id} to delete him from elastic search.`);
    }
    return body;
  });
};


/**
 * Note - only 1 "after" callback is allowed per endpoint, so if you enable autosync w/o oplog integration, you're
 * giving it up to elastic-harvest.
 */
ElasticHarvest.prototype.enableAutoSync = function enableAutoSync() {
  const endpoint = inflect.singularize(this.type);
  const _this = this;

  function resourceDeleted(resourceId) {
    _this.delete(resourceId)
      .catch((error) => {
        // This sort of error will not be solved by retrying it a bunch of times.
        console.warn(error && error.stack || error);
      });
  }

  function resourceChanged(resourceId) {
    console.log(`[Elastic-Harvest] Syncing ${_this.type}/${resourceId}`);
    return _this.harvest_app.adapter.find(endpoint, resourceId.toString())
      .then((resource) => {
        if (!resource) {
          throw new Error(`[Elastic-Harvest] Missing ${_this.type}/${resourceId}. Cannot sync with elastic-harvest.`);
        }
        return _this.expandAndSync(resource);
      })
      .catch((error) => {
      // This sort of error will not be solved by retrying it a bunch of times.
        console.warn(error && error.stack || error);
      });
  }

  if (!!this.harvest_app.options.oplogConnectionString) {
    console.warn('[Elastic-Harvest] Will sync primary resource data via oplog');
    this.harvest_app.onChange(endpoint, {
      insert: resourceChanged,
      update: resourceChanged,
      delete: resourceDeleted,
      asyncInMemory: _this.options.asyncInMemory
    });
  } else {
    console.warn('[Elastic-Harvest] Will sync primary resource data via harvest:after');
    this.harvest_app.after(endpoint, function handler(req) {
      if (req.method === 'POST' || (req.method === 'PUT' && this.id)) {
        console.log(`[Elastic-Harvest] Syncing ${_this.type}/${this.id}`);
        return _this.expandAndSync(this)
          .then((response) => {
            return unexpandEntity(response);
          });
      } else if (req.method === 'DELETE') {
        return this;
      }
      return this;
    });
  }
};


/**
 * expandAndSync: will expand all links in the model, then push it to elastic search.
 * Works with one model or an array of models.
 *
 * Todo: move to batch update model for multiples models.
 */
ElasticHarvest.prototype.expandAndSync = function expandAndSync(models) {
  const inputIsArray = _.isArray(models);
  const _models = [].concat(models);
  const _this = this;
  const promises = _.map(_models, (model) => {
    return _this.expandEntity(model).then((result) => {
      return _this.sync(result);
    });
  });
  return inputIsArray ? Promise.all(promises) : promises[0];
};


/**
 * sync: will push model to elastic search WITHOUT expanding any links.
 */
ElasticHarvest.prototype.sync = function sync(model) {
  const _model = _.cloneDeep(model);
  _model._lastUpdated = new Date().getTime();
  const esBody = JSON.stringify(_model);
  const _this = this;
  const routing = getRouting(_this);
  const _options = {
    uri: `${this.es_url}/${this.index}/${this.type}/${_model.id}${routing}`,
    body: esBody,
    pool: postPool
  };

  function getRouting(options) {
    if (!options.pathToCustomRoutingKey) return ''; // custom routing not enabled
    const value = Util.getProperty(_model, options.pathToCustomRoutingKey);
    if (value) {
      return `?routing=${value}`;
    }
    console.error('Routing Key required, but not available:', _this.type, options.pathToCustomRoutingKey,
      JSON.stringify(_model, null, 2));
    return '';
  }

  return new Promise((resolve, reject) => {
    request.put(_options, (error, response, body) => {
      const _body = JSON.parse(body);
      const _error = error || _body.error;

      if (_error) {
        const errMsg = error.message || JSON.stringify(error);
        console.warn(`[Elastic-Harvest] es_sync failed on model ${_model.id} :`, errMsg);
        reject(_error);
      } else {
        resolve(_model);
      }
    });
  })
    .catch(() => {
      throw new Error(`${_this.type} ${_model.id ? _model.id : ''} was unable to be added to the elastic search ` +
        'index. This likely means that one or more links were unable to be found.');
    });
};


function depthIsInScope(options, depth) {
  return !(depth > options.graphDepth.default);
}


ElasticHarvest.prototype.expandEntity = function expandEntity(entity, depth, currentPath) {
  const promises = {};
  const _this = this;

  function expandWithResult(_entity, _key, result) {
    if (depth > 0) {
      _.forIn(result, (value, key) => {
        if (value === '') delete result[key];
      });
      _entity[_key] = result;
    } else {
      _entity.links[_key] = result;
    }
  }

  function fetchLocalLink(collectionName, val, key) {
    let findFnName = 'find';
    if (_.isArray(entity.links[key])) {
      findFnName = 'findMany';
    }
    promises[key] = _this.singletonCache[findFnName](collectionName, entity.links[key])
      .then((result) => {
        expandWithResult(entity, key, result);
        return result;
      }, (err) => {
        const errorMessage = err || (`${val} could not be found in ${collectionName}`);
        // TODO: finish support for deletes. Maybe this comes back as an error & rejects the update.
        console.warn(errorMessage && errorMessage.stack || errorMessage);
        throw new Error(errorMessage);
      });
  }

  if (!depthIsInScope(this.options, depth, currentPath) || entity === undefined) {
    return Promise.resolve();
  }
  const _depth = (!depth) ? 0 : depth;

  // The first step to expand an entity is to get the objects it's linked to.
  _.each(entity.links || {}, (val, key) => {
    const collectionName = _this.collectionLookup[key];
    if (collectionName) {
      if (_.isObject(collectionName)) {
        const result = { id: val && val.id || val };
        expandWithResult(entity, key, result);
        promises[key] = Promise.resolve(result);
      } else {
        fetchLocalLink(collectionName, val, key);
      }
    } else {
      console.warn(`[Elastic-Harvest] Failed to find the name of the collection with ${key} in it.`);
      expandWithResult(entity, key, { id: val && val.id || val });
    }
  }, this);

  // The only "links" parameter at the end of the expansion should be on the original entity;
  if (_depth > 0) {
    delete entity.links;
  }

  // To handle "links" of those freshly found objects, a bit of recursion.
  return Promise.props(promises)
    .then((results) => {
      const furtherRequiredExpansions = {};
      const newDepth = _depth + 1;

      _.each(results || {}, (val, key) => {
        if (val && val.links) {
          furtherRequiredExpansions[key] = _this.expandEntity(val, newDepth);
        } else if (val && _.isArray(val)) {
        // ToDo: a further optimization might be to group all similar requests across array elements & fire them off as
        //       1 request.
          _.each(val, (value) => {
            if (value.links) {
              !furtherRequiredExpansions[key] && (furtherRequiredExpansions[key] = []);
              furtherRequiredExpansions[key].push(_this.expandEntity(value, newDepth));
            }
          });

          if (furtherRequiredExpansions[key]) {
            furtherRequiredExpansions[key] = Promise.all(furtherRequiredExpansions[key]);
          }
        }
      });

      // Patch the results of recursion (to "depth+1" level) into the "depth" level entity
      return Promise.props(furtherRequiredExpansions)
        .then((response) => {
          _.each(response || {}, (val, key) => {
            if (_depth > 0) {
              entity[key] = val;
            } else {
              entity.links[key] = val;
            }
          });
          return entity;
        });
    });
};


ElasticHarvest.prototype.initializeIndex = function initializeIndex() {
  const url = `${this.es_url}/${this.index}`;
  console.log('[Elastic-Harvest] Initializing es index.');
  return requestAsync({ uri: url, method: 'PUT', body: '' }).then((response) => {
    const body = JSON.parse(response[1]);
    if (body.error) {
      if (body.error.type === 'index_already_exists_exception') {
        console.info('[Elastic-Harvest] Index Already Exists');
        return {};
      }
      throw new Error(response[1]);
    } else {
      return body;
    }
  });
};


ElasticHarvest.prototype.deleteIndex = function deleteIndex() {
  const url = `${this.es_url}/${this.index}`;
  console.log('[Elastic-Harvest] Deleting es index.');
  return requestAsync({ uri: url, method: 'DELETE', body: '' }).then((response) => {
    const body = JSON.parse(response[1]);
    if (body.error) {
      if (_s.contains(body.error, 'IndexMissingException')
        || (body.error.type && body.error.type === 'index_not_found_exception')) {
        console.warn('[Elastic-Harvest] Tried to delete the index, but it was already gone!');
        return body;
      }
      throw new Error(response[1]);
    } else {
      return body;
    }
  });
};


/**
 * Posts an elastic search mapping to the server.Idempotent, so feel free to do this when starting up your server,
 * but if you change the mapping in a way that elastic search can't apply a transform to the current index to get there,
 * you'll have to reload the entire search index with new data, because this will fail.
 */
ElasticHarvest.prototype.initializeMapping = function initializeMapping(mapping, shouldNotRetry) {
  const _this = this;
  const reqBody = JSON.stringify(mapping);
  const esResource = `${this.es_url}/${this.index}/${this.type}/_mapping`;
  return requestAsync({ uri: esResource, method: 'PUT', body: reqBody }).then((response) => {
    const body = JSON.parse(response[1]);
    if (body.error) {
      if (((body.error.type && body.error.type === 'index_not_found_exception')
          || _s.contains(body.error, 'IndexMissingException')) && !shouldNotRetry) {
        console.warn('[Elastic-Harvest] Looks like we need to create an index - I\'ll handle that automatically for ' +
          'you & will retry adding the mapping afterward.');
        return _this.initializeIndex().then(() => {return _this.initializeMapping(mapping, true);});
      }
      throw new Error(response[1]);
    } else {
      return body;
    }
  });
};


function getCollectionLookup(harvestApp, type) {
  const schemaName = inflect.singularize(type);
  const _startingSchema = harvestApp._schema[schemaName];
  const retVal = {};
  const maxDepth = 20;
  let depth = 0;
  const linkedSchemas = {};
  linkedSchemas[schemaName] = true;

  function getLinkedSchemas(startingSchema) {
    depth++;
    if (depth >= maxDepth) {
      console.warn(`[Elastic-Harvest] Graph depth of ${depth} exceeds ${maxDepth}. Graph dive halted prematurely - ` +
        'please investigate.'); // harvest schema may have circular references.
      return;
    }

    function setValueAndGetLinkedSchemas(propertyName, propertyValue) {
      retVal[propertyName] = propertyValue;
      !linkedSchemas[propertyName]
        && harvestApp._schema[propertyValue]
        && (linkedSchemas[propertyName] = true)
        && getLinkedSchemas(harvestApp._schema[propertyValue]);
    }
    _.each(startingSchema, (property, propertyName) => {
      if (typeof property !== 'function') {
        if (_.isString(property)) {
          setValueAndGetLinkedSchemas(propertyName, property);
        } else if (_.isArray(property)) {
          if (_.isString(property[0])) {
            setValueAndGetLinkedSchemas(propertyName, property[0]);
          } else if (_.isObject(property) && !property[0].baseUri) {
            setValueAndGetLinkedSchemas(propertyName, property[0].ref);
          }
        } else if (_.isObject(property) && !(property.baseUri)) {
          setValueAndGetLinkedSchemas(propertyName, property.ref);
        }
      }
    });
  }

  getLinkedSchemas(_startingSchema);
  return retVal;
}


ElasticHarvest.prototype.syncIndex = function syncIndex(resource, action, data) {
  if (resource === this.type) {
    return _syncRootDocument(this, action, data);
  }
  return _syncNestedDocument(this, resource, data);
};


function _syncRootDocument(EH, action, data) {
  // if root and update or insert call expandAndSync directly
  // else root and delete call delete directly
  const isDelete = action.replace(/\w/, '').toUpperCase() === 'DELETE';
  if (isDelete) return EH.delete(data.id);
  return EH.expandAndSync.apply(EH, data);
}


function _syncNestedDocument(EH, resource, data) {
  // find the possible ES paths, do a simple search for any & sync all root docs
  const singleResource = inflect.singularize(resource);
  const updatePromises = _.map(EH.invertedAutoUpdateInput[singleResource], (path) => {
    return EH.updateIndexForLinkedDocument(path, data);
  });

  return Promise.all(updatePromises);
}


function generateUpdateMap(autoUpdateInput) {
  const auto = {};
  _.forOwn(autoUpdateInput, (value, key) => {
    if (!_.isArray(auto[value])) return (auto[value] = [key]);
    return auto[value].push(key);
  });

  return auto;
}

module.exports = ElasticHarvest;
