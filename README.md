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

//hash of properties to related mongo collections
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

//Create elastic search endpoint
    var dealerSearch = new ElasticFortune(fortune_app, Elastic_Search_URL,Elastic_Search_Index, type, collectionNameLookup);
    fortune_app.router.get('/dealers/search', dealerSearch.route);

//Required to make the elastic search endpoint work properly
    fortune_app.setOnRouteCreated("dealer",function(route){
        dealerSearch.setFortuneRoute(route);
    },this);

//Create dealer :after endpoint & sync elastic search.
//Note - only 1 "after" callback is allowed per endpoint, so if you enable autosync, you're giving it up to elastic-fortune.
    dealerSearch.enableAutoSync("dealer");

//Alternative way to create dealer :after endpoint & sync elastic search. This approach gives you access to do more in the after callback.
    this.fortune_app.after("dealer", function (req, res, next) {
        if (req.method === 'POST' || (req.method === 'PUT' && this.id)) {
            return dealerSearch.expandAndSync(this);
        } else {
            return this;
        }
    });
    
//If you just want to expand an object's links:
dealerSearch.expandEntity(dealer);

//If you just want to send an object to elastic search without expanding it's links:
 dealerSearch.sync(this);