Extra Prerequisites
---------------
Requires: 
"fortune-agco": "~0.2.9",
"fortune-mongodb-agco": "~0.2.4",

But they aren't direct dependencies, so they aren't listed in package.json; however you're required to be using at least those versions of those packages
for compatibility with this module.

We currently also require that you use mongodb as your datastore.

Usage
----

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
}
var Elastic_Search_URL = process.env.BONSAI_URL || "http://127.0.0.1:9200";
var Elastic_Search_Index = "dealer-api";
var type = "dealers";
```
#Create elastic search endpoint
```js
var dealerSearch = new ElasticFortune(fortune_app, Elastic_Search_URL,Elastic_Search_Index, type, collectionNameLookup);
fortune_app.router.get('/dealers/search', dealerSearch.route);
//Required to make the elastic search endpoint work properly
fortune_app.setOnRouteCreated("dealer",function(route){
    dealerSearch.setFortuneRoute(route);
},this);
```


##Create an :after callback & sync elastic search after each item is posted to fortune
#####Note - only 1 "after" callback is allowed per endpoint, so if you enable autosync, you're giving it up to elastic-fortune.
```js
dealerSearch.enableAutoSync("dealer");
```


##Alternative way to create an :after endpoint & sync elastic search. This approach gives you access to do more in the after callback.
```js
this.fortune_app.after("dealer", function (req, res, next) {
    if (req.method === 'POST' || (req.method === 'PUT' && this.id)) {
        return dealerSearch.expandAndSync(this);
    } else {
        return this;
    }
});
```    


##Expand an object's links:
```js
dealerSearch.expandEntity(dealer);
```


##Send an object to elastic search after expanding it's links:
```js
dealerSearch.expandAndSync(dealer);
```


##Send an object to elastic search without expanding it's links:
```js
dealerSearch.sync(dealer);
```


##Delete an object in elastic search: (added in 0.0.3)
```js
dealerSearch.delete(dealer.id);
```


##Create an :after callback & keep your elastic search index up to date with PUTs and POSTs on linked documents. (added in 0.0.5)
#####Note - only 1 "after" callback is allowed per endpoint, so if you enable indexUpdateOnModelUpdate, you're giving it up to elastic-fortune.
```js
dealerSearch.enableAutoIndexUpdateOnModelUpdate("subdocumentsFortuneEndpoint","links.path.to.object.id");
e.g. dealerSearch.enableAutoIndexUpdateOnModelUpdate("brand","links.current_contracts.brand.id");
```


##Update Elastic Search index when a related fortune model changes (added in 0.0.5)
```js
entity = this;
dealerSearch.updateIndexForLinkedDocument("links.path.to.object.id",entity);
```

##New aggregation syntax introduced (added in 0.0.5)
GET on search url endpoint, with a url query like:

```js
http://fuse-api.example.com/tracking_points/search?
links.equipment.id=<comma-seperated-eq-ids>&limit=0&
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
```

Expected response:
```js
{
    "tracking_points": [],
    "meta": {
        "eq_agg": {
            "<eq_id1>": {
                "eq_agg_position_latest": {
                    "id": "53b186e505904f229c523ec9",
                    "alt": 39,
                    "head": 24,
                    "loc": {
                        "type": "Point",
                        "coordinates": [
                            -114.7253799,
                            33.4665489
                        ]
                    },
                    "time": "2014-06-30T15:44:44.000Z"
                },
                "eq_agg_variables": {
                    "1862": {
                        "eq_agg_variables_latest": {
                            "tracking_data": [
                                {
                                    "spn": 1862,
                                    "raw": 25,
                                    "imp": 0.05575,
                                    "met": 0.09000000000000001,
                                    "brit": 0.05575
                                }
                            ]
                        }
                    },
                    "2147542304": {
                        "eq_agg_variables_latest": {
                            "tracking_data": [
                                {
                                    "spn": 2147542304,
                                    "raw": 19,
                                    "imp": 45.1612903224,
                                    "met": 45.1612903224,
                                    "brit": 45.1612903224
                                }
                            ]
                        }
                    }
                }
            },
            "<eq_id2>": {
                //..
            }
        }
    },
    "links": {
        //..
    }
}
```

##Initialize an elastic search mapping (added in 0.0.6)
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