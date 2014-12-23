# Elastic-Fortune

Elastic-Fortune is a Nodejs implementation of the [JSON API Search Profile](https://github.com/agco-adm/json-api-search-profile).

This library ties together Fortunejs and Elasticsearch to offer the required [linked resource filtering and aggregation](https://github.com/agco-adm/json-api-search-profile/blob/master/public/profile.md) features.

Apart from that it also provides a number of helper functions to synchronize Fortunejs / Mongodb resources with an Elasticsearch backend.


## Features

- Aggregations : stats, extended_stats, top_hits, terms
- Primary and Linked resource filtering interop

## Roadmap

- Top_hits aggregation interop with JSON API features, inclusion and sparse fieldsets [#1](https://github.com/agco-adm/elastic-fortune/issues/1)
- More aggregations :
- Reliable Fortunejs/Mongodb - Elasticsearch data synchronisation ( oplog based )
- Support adaptive queries, use the ES mapping file to figure out whether to use parent/child or nested queries / aggregations
- Use Fortunejs associations + ES mapping file to assemble data graph rather than having to explicitly specify them through 'collectionNameLookup'
- Use Fortunejs associations + ES mapping file to discover which Mongodb collections have to be synced rather than having to register them explicitly
- Bootstrap Elasticsearch with existing data from Fortunjs resources through REST endpoint
- Bootstrap Elasticsearch mapping file through REST endpoint

## Dependencies
 
"fortune-agco": "*",
"fortune-mongodb-agco": "*",


## Usage

```js
//Hash of properties to related mongo collections
var collectionNameLookup = {
    "brand": "brand",
    "product_type": "product_type",
    "contract_type": "contract_type",
    "region": "region",
    "country": "country",
    "address_country": "country",
    "address_state_province": "state_province",
    "current_contracts": "contract",
    "phone_numbers": "phone_number",
    "business_hours": "business_hours",
    "current_offerings": "offering",
    "dealer_misc": "dealers_misc"
}collectionNameLookup
var Elastic_Search_URL = process.env.BONSAI_URL || "http://127.0.0.1:9200";
var Elastic_Search_Index = "dealer-api";
var type = "dealers";
```
#### Create elastic search endpoint (NB: api changed in v0.0.6)
```js
var dealerSearch = new ElasticFortune(fortune_app, Elastic_Search_URL,Elastic_Search_Index, type, collectionNameLookup);
fortune_app.router.get('/dealers/search', dealerSearch.route);
//Required to make the elastic search endpoint work properly
fortune_app.onRouteCreated('dealer').then(function(fortuneRoute){
    dealerSearch.setFortuneRoute(fortuneRoute);
});
```


#### Create an :after callback & sync elastic search after each item is posted to fortune
#####Note - only 1 "after" callback is allowed per endpoint, so if you enable autosync, you're giving it up to elastic-fortune.
```js
dealerSearch.enableAutoSync("dealer");
```


#### Alternative way to create an :after endpoint & sync elastic search. This approach gives you access to do more in the after callback.
```js
this.fortune_app.after("dealer", function (req, res, next) {
    if (req.method === 'POST' || (req.method === 'PUT' && this.id)) {
        return dealerSearch.expandAndSync(this);
    } else {
        return this;
    }
});
```    


#### Expand an object's links:
```js
dealerSearch.expandEntity(dealer);
```


#### Send an object to elastic search after expanding it's links:
```js
dealerSearch.expandAndSync(dealer);
```


#### Send an object to elastic search without expanding it's links:
```js
dealerSearch.sync(dealer);
```


#### Delete an object in elastic search: (added in 0.0.3)
```js
dealerSearch.delete(dealer.id);
```


#### Create an :after callback & keep your elastic search index up to date with PUTs and POSTs on linked documents. (added in 0.0.5)
#####Note - only 1 "after" callback is allowed per endpoint, so if you enable indexUpdateOnModelUpdate, you're giving it up to elastic-fortune.
```js
dealerSearch.enableAutoIndexUpdateOnModelUpdate("subdocumentsFortuneEndpoint","links.path.to.object.id");
e.g. dealerSearch.enableAutoIndexUpdateOnModelUpdate("brand","links.current_contracts.brand.id");
```


#### Update Elastic Search index when a related fortune model changes (added in 0.0.5)
```js
entity = this;
dealerSearch.updateIndexForLinkedDocument("links.path.to.object.id",entity);
```

#### Initialize an elastic search mapping (added in 0.0.6)
```js
dealerSearch.initializeMapping(mappingObject).
```

The Mapping object can be loaded from a js file that looks like:
```js
module.exports= {
    "trackingPoints": {
        "properties": {
            "data": {
                "type": "nested"
            },
            "loc" : {
                "type" : "nested",
                "properties": {
                    "location" : {
                        "type" : "geo_point"
                    }
                }
            },
            "time" : {
                "type" : "date"
            },
            "links": {
                "type": "nested",
                "properties": {
                    "equipment": {
                        "type": "nested",
                        "properties": {
                            "model": {
                                "type": "nested",
                                "properties": {
                                    "brand":{
                                        "type": "nested",
                                        "properties": {
                                            "name":{
                                                "type": "string",
                                                "index": "not_analyzed"
                                            }
                                        }
                                    },
                                    "equipmentType":{
                                        "type": "nested",
                                        "properties": {
                                            "value":{
                                                "type": "string",
                                                "index": "not_analyzed"
                                            }
                                        }
                                    },
                                    "name":{
                                        "type": "string",
                                        "index": "not_analyzed"
                                    }
                                }
                            }
                        }
                    },
                    "duty": {
                        "type": "nested",
                        "properties": {
                            "status":{
                                "type": "string",
                                "index": "not_analyzed"
                            }
                        }
                    }
                }
            }
        }
    }
}
```
