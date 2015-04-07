var inflect = require('i')();
var should = require('should');
var _ = require('lodash');
var RSVP = require('rsvp');
var request = require('supertest');

var Promise = RSVP.Promise;
var bluebird = require('bluebird');
var fixtures = require('./../fixtures.json');

var baseUrl = 'http://localhost:' + process.env.PORT;
var keys = {};

var ES_INDEX_WAIT_TIME = 3000; //we'll wait this amount of time before querying the es_index.
_.each(fixtures, function (resources, collection) {
    keys[collection] = inflect.pluralize(collection);
});

describe('using mongodb + elastic search', function () {
    var ids = {};
    this.timeout(100000);
    before(function (done) {
        this.app
            .then(function (harvestApp){
                var expectedDbName = harvestApp.options.db;
                return new Promise(function(resolve){
                    harvestApp.adapter.mongoose.connections[1].db.collectionNames(function(err, collections){
                        resolve(_.compact(_.map(collections, function(collection){

                            var collectionParts = collection.name.split(".");
                            var name = collectionParts[1];
                            var db = collectionParts[0];

                            if(name && (name !== "system") && db && (db === expectedDbName)){
                                return new Promise(function(resolve){
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
                return bluebird.all(wipeFns);
            }).then(function () {
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

                return bluebird.all(createResources).then(function() {
                    setTimeout(done,ES_INDEX_WAIT_TIME);
                    //done();
                });
            })
            .catch(function (err) {
                done(err);
            });
    });

    require("./associations")(baseUrl,keys,ids,ES_INDEX_WAIT_TIME);
    require("./limits")(baseUrl,keys,ids);
    require("./includes")(baseUrl,keys,ids,ES_INDEX_WAIT_TIME);
    require("./filters")(baseUrl,keys,ids);
    require("./aggregations")(baseUrl,keys,ids,ES_INDEX_WAIT_TIME);
    require("./mappingMaker")();
    require("./autoUpdateInputGenerator")();
    require("./deletes")(baseUrl,keys,ids,ES_INDEX_WAIT_TIME);


    //require("./resources")(baseUrl,keys,ids,ES_INDEX_WAIT_TIME);

    after(function () {
            var promises = [];
            return bluebird.delay(2000).then(function(){
                _.each(fixtures, function (resources, collection) {
                    var key = keys[collection];

                    promises.push(bluebird.all(ids[key].map(function (id) {
                        return new Promise(function (resolve) {
                            request(baseUrl)
                                .del('/' + key + '/' + id)
                                .expect(204)
                                .end(function (error) {
                                    should.not.exist(error);
                                    resolve();
                                });
                        });
                    })));

                });
                return bluebird.all(promises);

            })
    });


});