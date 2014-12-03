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


##Update Elastic Search index when a specific field changes (added in 0.0.5)
```js
entity = this;
dealerSearch.updateIndexForLinkedDocument("links.path.to.object.id",entity);
```
