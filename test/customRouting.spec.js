/**
 * Unit tests around _routing (and sharding)
 *
 */
'use strict'


// dependencies
const _ = require('lodash')
const $http = require('http-as-promised')
const request = require('request')
const seeder = require('./seeder')
const Promise = require('bluebird')
const ElasticHarvest = require('../elastic-harvester')


const syncWaitTime = 1000  // milliseconds
const collection = 'people'


function queryElasticSearch(config, command) {
    return new Promise(function (resolve, reject) {
        var options = {
            uri: config.harvester.options.es_url + command
        }
        request.get(options, function (error, response, body) {
            if (error) return reject(error)
            return resolve(JSON.parse(body))
        })
    })
}

function catElasticSearch(config, catCommand) {
    return new Promise(function (resolve, reject) {
        var options = {
            uri: config.harvester.options.es_url + '/_cat/' + catCommand
        }
        request.get(options, function (error, response, body) {
            if (error) return reuect(error)
            return resolve(body)
        })
    })
}

// need a harvester with routing turned on.
describe('Custom Routing', function () {
    var seederInstance
    var config
    var options
    var personCustomRoutingPropertyName

    beforeEach(function () {
        seederInstance = seeder(this.harvesterApp)
        seederInstance.dropCollections(collection)
        config = this.config
        options = config.harvester.options
        personCustomRoutingPropertyName = this.personCustomRoutingPropertyName
        this.createOptions = function (uri) {
            // helper function to create $http options object when given a uri
            return {
                url: config.baseUrl + uri,
                json: true,
                error: false
            }
        }
    })

    afterEach(function () {
    })

    describe('The setCustomRouting function', function () {

        it('should be a function of ElasticHarvest', function () {
            var testSearch = new ElasticHarvest(this.app, options.es_url, options.es_index, 'test')

            testSearch.should.have.property('setCustomRouting').and.be.an.Function
        })

        it('should add property to options', function () {
            var testSearch = new ElasticHarvest(this.app, options.es_url, options.es_index, 'test')

            testSearch.setCustomRouting('gender')
            testSearch.options.customRouting.should.equal('gender')
        })

    })

    describe('Syncing with CustomRouting', function () {
        it('should send documents to different shards', function () {
            // plan is to post a document, which should get indexed
            // then we can use the ElasticSearch API to get the shard our key would map to and the documents listed per
            // shard and check that it incremented by one after we added our document.
            var newPerson = {
                id: 'c05afa8f-b26b-481e-b9a8-0b306d4ef026',
                name: 'Alice',
                appearances: 893,
                dateOfBirth: '1992-08-25T13:22:38.000Z'
            }
            var routingKey = this.personRoutingKey

            return seederInstance.post(collection, [newPerson])
                .then(function (results) {
                    // check it was posted correctly. Note this can pass, but indexing might still fail...
                    results.should.have.property(collection)
                    results[collection].should.be.an.Array
                    results[collection][0].should.equal(newPerson.id)

                    return Promise.delay(syncWaitTime)  // allow sync to happen
                })
                .then(function () {
                    // ElasticSearch API command to get the shard searched for a given routing key
                    var command = '/' + config.harvester.options.es_index + '/_search_shards?routing=' + newPerson[routingKey]
                    // ElasticSearch "_cat" command that gets the number of documents per shard. Also indicates
                    // parimary/replica since we can't filter the replicas out, we'll have to do this manually.
                    var catCommand = 'shards/' + config.harvester.options.es_index + '?h=s,p,d'

                    return Promise.all([
                        queryElasticSearch(config, command),
                        catElasticSearch(config, catCommand)
                    ])
                })
                .spread(function validateRoutingToShardsWasUsed(searchedShards, shardStats) {
                    // an extra check that only one of our 5 shards was searched
                    searchedShards.shards.length.should.equal(1)     // for some reason this is an array of arrays
                    searchedShards.shards[0].length.should.equal(1)

                    // now get that shard number
                    var searchShard = searchedShards.shards[0][0].shard
                    var docsCount

                    // filter the results to get the shard we care about
                    _.forEach(shardStats.split('\n'), function (row) {
                        var values = row.split(' ')
                        var shard = parseInt(values[0], 10)
                        var docs = parseInt(values[2], 10)

                        if (shard === searchShard && values[1] === 'p' && !isNaN(docs)) {
                            docsCount = docs
                            return false
                        }
                    })
                    docsCount.should.equal(1)
                })
        })
    })

    describe('Searching With Custom Routing', function () {
        var config

        beforeEach(function seedPeople() {
            config = this.config
            this.timeout(config.esIndexWaitTime + 6000)
            return seeder(this.harvesterApp).dropCollectionsAndSeed('pets', 'people', 'equipment')
                .then(function () {
                    return Promise.delay(config.esIndexWaitTime + 2000)
                })
        })

        // TODO: check that all code that adds routing while searching is being tested in this code. Perpahs simpleSearch doesn't get tested here.
        it('should still search WHEN customRouting is enabled BUT not given as a search predicate', function () {
            return $http.get(this.createOptions('/people/search?appearances=le=2000'))
                .spread(function (res, body) {
                    res.statusCode.should.equal(200)
                    body.people.should.be.an.Array
                    body.people.length.should.equal(1)
                    body.people[0].name.should.equal('Wally')
                })
        })

        it('should add one custom routing value WHEN customRouting is enabled', function () {
            return $http.get(this.createOptions('/people/search?name=Dilbert'))
                .spread(function (res, body) {
                    res.statusCode.should.equal(200)
                    body.people.should.be.an.Array
                    body.people.length.should.equal(1)
                    body.people[0].should.have.property('name').and.equal('Dilbert')
                })
                // TODO: SP check url sent to elasticSearch for the routing parameters, but also send the actual request too. This may require two separate requests or just one request where we intercept the request
        })

        it('should add many custom routing values WHEN custumRouting is enabled', function () {
            return $http.get(this.createOptions('/people/search?name=Dilbert,Wally'))
                .spread(function (res, body) {
                    res.statusCode.should.equal(200)
                    body.people.should.be.an.Array
                    body.people.length.should.equal(2)
                    _.find(body.people, { name: 'Wally'}).should.be.an.Object
                    _.find(body.people, { name: 'Dilbert'}).should.be.an.Object
                })
        })

        it('should still search WHEN customRouting is NOT enabled', function () {
            var searchKey = 'name'
            var searchTerm = 'Dilbot'

            return $http.get(this.createOptions('/equipment/search?' + searchKey + '=' + searchTerm))
                .spread(function (res, body) {
                    res.statusCode.should.equal(200)
                    body.equipment.should.be.an.Array
                    body.equipment.length.should.equal(1)
                    body.equipment[0].should.have.property(searchKey).and.equal(searchTerm)
                })
        })
    })
})

