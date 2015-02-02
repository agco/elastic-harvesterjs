var inflect = require('i')();
var should = require('should');
var _ = require('lodash');
var RSVP = require('rsvp');
var request = require('supertest');

var Promise = RSVP.Promise;
var fixtures = require('./../fixtures.json');

var baseUrl = 'http://localhost:' + process.env.PORT;
var keys = {};
var harvestPreparedDeferred = RSVP.defer();

var ES_INDEX_WAIT_TIME = 1000; //we'll wait this amount of time before querying the es_index.
_.each(fixtures, function (resources, collection) {
    keys[collection] = inflect.pluralize(collection);
});

describe('using mongodb + elastic search', function () {
    var ids = {};
    this.timeout(5000);
    var _harvestApp;
    before(function (done) {
        this.app
            .then(function (harvestApp){
                _harvestApp = harvestApp;
                var expectedDbName = harvestApp.options.db;
                harvestPreparedDeferred.resolve(harvestApp);
                return new Promise(function(resolve){
                    harvestApp.adapter.mongoose.connections[1].db.collectionNames(function(err, collections){
                        resolve(_.compact(_.map(collections, function(collection){

                            var collectionParts = collection.name.split(".");
                            var name = collectionParts[1];
                            var db = collectionParts[0];

                            if(name && (name !== "system") && db && (db === expectedDbName)){
                                return new RSVP.Promise(function(resolve){
                                    harvestApp.adapter.mongoose.connections[1].db.collection(name, function(err, collection){
                                        collection.remove({},null, function(){
                                            console.log("Wiped collection", name);
                                            resolve();
                                        });
                                    });
                                });
                            }
                            return null;
                        })));
                    });
                });
            }).then(function(wipeFns){
                console.log("Wiping collections:");
                return RSVP.all(wipeFns);
            }).then(function(){
                console.log("Deleting elastic-search index.");
                return new Promise(function (resolve) {
                    request(_harvestApp.options.es_url)
                        .delete('/' + _harvestApp.options.es_index)
                        .send({})
                        .expect('Content-Type', /json/)
                        .end(function (error, response) {
                            should.not.exist(error);
                            var body = JSON.parse(response.text);
                            resolve();
                        });
                })

            })

            .then(function(){
                console.log("Adding new elastic-search index.");
                return new Promise(function (resolve) {
                    request(_harvestApp.options.es_url)
                        .post('/' + _harvestApp.options.es_index)
                        .send({})
                        .expect('Content-Type', /json/)
                        .end(function (error, response) {
                            should.not.exist(error);
                            var body = JSON.parse(response.text);
                            resolve();
                        });
                })
            })



            .then(function () {
                console.log("--------------------");
                console.log("Running tests:");


                var createResources = [];

                _.each(fixtures, function (resources, collection) {
                    var key = keys[collection];

                    createResources.push(new Promise(function (resolve) {
                        var body = {};
                        body[key] = resources;
                        request(baseUrl)
                            .post('/' + key)
                            .send(body)
                            .expect('Content-Type', /json/)
                            .expect(201)
                            .end(function (error, response) {
                                should.not.exist(error);
                                var resources = JSON.parse(response.text)[key];
                                ids[key] = ids[key] || [];
                                resources.forEach(function (resource) {
                                    ids[key].push(resource.id);
                                });
                                resolve();
                            });
                    }));
                });

                return RSVP.all(createResources).then(function() {
                    setTimeout(done,ES_INDEX_WAIT_TIME);
                    //done();
                });
            })
            .catch(function (err) {
                done(err);
            });
    });


//    require("./resources")(baseUrl,keys,ids);
//    require("./associations")(baseUrl,keys,ids);

    require("./limits")(baseUrl,keys,ids);
    require("./includes")(baseUrl,keys,ids,ES_INDEX_WAIT_TIME);
    require("./filters")(baseUrl,keys,ids);
    require("./aggregations")(baseUrl,keys,ids,ES_INDEX_WAIT_TIME);

    harvestPreparedDeferred.promise.then(function(harvestApp){
        require("./mapmaker")(harvestApp,"people");
    });

    after(function (done) {
        _.each(fixtures, function (resources, collection) {
            var key = keys[collection];

            RSVP.all(ids[key].map(function (id) {
                return new Promise(function (resolve) {
                    request(baseUrl)
                        .del('/' + key + '/' + id)
                        .expect(204)
                        .end(function (error) {
                            should.not.exist(error);
                            resolve();
                        });
                });
            })).then(function () {
                done();
            }, function () {
                throw new Error('Failed to delete resources.');
            });
        });
    });

});