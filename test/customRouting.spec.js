/**
 * Unit tests around _routing (and sharding)
 *
 */
'use strict'


// dependencies
var _ = require('lodash')
var $http = require('http-as-promised')
var harvester = require('harvesterjs');
var request = require('request')
var seeder = require('./seeder')
var Promise = require('bluebird')
var ElasticHarvest = require('../elastic-harvester')
var Utils = require('../Util')

var syncWaitTime = 1000  // milliseconds


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
    var dealerSeederInstance
    var dealerHarvesterApp
    var config
    var options
    var dealerOptions
    var dealerPort
    var personCustomRoutingKeyPath
    var warriorCustomRoutingKeyPath

    // before(function startDealerHarvesterApp() {
    //     var config = this.config
    //
    //     dealerPort = config.harvester.port + 1
    //     dealerOptions = _.cloneDeep(config.harvester.options)
    //     dealerOptions.db = 'ehTestDb2'
    //     dealerOptions.connectionString = 'mongodb://127.0.0.1:27017/' + dealerOptions.db
    //     dealerHarvesterApp = harvester(dealerOptions)
    //     dealerHarvesterApp.resource('dealer', {
    //         name: Joi.string()
    //     }).listen(dealerPort)
    //     dealerSeederInstance  = seeder(dealerHarvesterApp, 'http://localhost:' + dealerPort)
    //     return dealerSeederInstance.dropCollections('dealers')
    //         .then(function () {
    //             return dealerSeederInstance.seedCustomFixture({
    //                 dealers: [
    //                     {
    //                         id: '732a8c22-a363-4ee6-b3b2-14fb717e8d1b',
    //                         name: 'Dogbert Arms & Co'
    //                     }
    //                 ]
    //             })
    //         })
    // })

    beforeEach(function () {
        config = this.config
        seederInstance = seeder(this.harvesterApp)
        options = config.harvester.options
        personCustomRoutingKeyPath = this.personCustomRoutingKeyPath
        warriorCustomRoutingKeyPath = this.warriorCustomRoutingKeyPath
        this.createOptions = function (uri) {
            // helper function to create $http options object when given a uri
            return {
                url: config.baseUrl + uri,
                json: true,
                error: false
            }
        }
    })

    describe('The setPathToCustomRoutingKey function', function () {

        it('should be a function of ElasticHarvest', function () {
            var testSearch = new ElasticHarvest(this.app, options.es_url, options.es_index, 'test')

            testSearch.should.have.property('setPathToCustomRoutingKey').and.be.an.Function
        })

        it('should add property to options', function () {
            var testSearch = new ElasticHarvest(this.app, options.es_url, options.es_index, 'test')

            testSearch.setPathToCustomRoutingKey('gender')
            testSearch.pathToCustomRoutingKey.should.equal('gender')
        })

        it('should add multiple pathToCustomRoutingKeys for each model', function () {
            var testSearchA = new ElasticHarvest(this.app, options.es_url, options.es_index, 'testA')
            var testSearchB = new ElasticHarvest(this.app, options.es_url, options.es_index, 'testB')

            testSearchA.setPathToCustomRoutingKey('gender')
            testSearchB.setPathToCustomRoutingKey('nationality')
            testSearchA.pathToCustomRoutingKey.should.equal('gender')
            testSearchB.pathToCustomRoutingKey.should.equal('nationality')
        })

    })

    describe('Syncing WHEN CustomRouting is enabled', function () {

        function validateShardMatchesSearch(config, customRoutingValue) {
           return Promise.all([
               // ElasticSearch API command to get the shard searched for a given routing key
               queryElasticSearch(config, '/' + config.harvester.options.es_index + '/_search_shards?routing=' + customRoutingValue),
               // ElasticSearch "_cat" command that gets the number of documents per shard. Also indicates
               // parimary/replica since we can't filter the replicas out, we'll have to do this manually.
               catElasticSearch(config, 'shards/' + config.harvester.options.es_index + '?h=s,p,d')
           ])
               .spread(function (searchedShards, shardStats) {
                   var searchShard = searchedShards.shards[0][0].shard
                   var docsCount

                   _.forEach(shardStats.split('\n'), function (row) {
                       var values = row.split(' ')
                       var shard = parseInt(values[0], 10)
                       var docs = parseInt(values[2], 10)

                       if (shard === searchShard && values[1] === 'p' && !isNaN(docs)) {
                           docsCount = docs
                           return false
                       }
                   })
                   return docsCount
               })
        }

        it('should route documents to different shards', function () {
            var collection = 'people'
            // plan is to post a document, which should get indexed
            // then we can use the ElasticSearch API to get the shard our key would map to and the documents listed per
            // shard and check that it incremented by one after we added our document.
            var newPerson = {
                id: 'c05afa8f-b26b-481e-b9a8-0b306d4ef026',
                name: 'Alice',
                appearances: 893,
                dateOfBirth: '1992-08-25T13:22:38.000Z'
            }
            var routingKey = this.personCustomRoutingKeyPath

            this.timeout(syncWaitTime + 2000)
            return seederInstance.dropCollections(collection)
                .then(function () {
                    return seederInstance.post(collection, [newPerson])
                })
                .then(function (results) {
                    // check it was posted correctly. Note this can pass, but indexing might still fail...
                    results.should.have.property(collection)
                    results[collection].should.be.an.Array
                    results[collection][0].should.equal(newPerson.id)

                    return Promise.delay(syncWaitTime + 1000)  // allow sync to happen
                })
                .then(function () {
                    return validateShardMatchesSearch(config, newPerson[routingKey])
                })
                .then(function (shardMatchesSearch) {
                    shardMatchesSearch.should.equal(1)  // there should only be one document here
                })
        })

        it('should send document to different shards WHEN pathToRoutingKey is a path', function () {
            var newEquipment = {
                name: 'Fist of Fury',
                id: '024f266c-e0e6-4384-b55e-92693c43096e',
                links: {
                    dealer: '732a8c22-a363-4ee6-b3b2-14fb717e8d1b'
                }
            }
            var newWarrior = {
                name: 'Alice the Angry',
                id: '781ace40-60c1-4c0c-809b-58352c024c36',
                links: {
                    weapon: newEquipment.id
                }
            }
            var warriorCustomRoutingKeyPath = this.warriorCustomRoutingKeyPath

            this.timeout(syncWaitTime + 3000)
            return seederInstance.dropCollections('warriors', 'equipment')
                .then(function () {
                    return Promise.all([
                        seederInstance.post('equipment', [ newEquipment ]),
                        seederInstance.post('warriors', [ newWarrior ])
                    ])
                })
                .spread(function (equipment, warriors) {
                    equipment.should.have.property('equipment')
                    equipment['equipment'].should.be.an.Array
                    equipment['equipment'][0].should.equal(newEquipment.id)
                    warriors.should.have.property('warriors')
                    warriors['warriors'].should.be.an.Array
                    warriors['warriors'][0].should.equal(newWarrior.id)
                    return Promise.delay(syncWaitTime + 2000)  // allow sync to happen
                })
                .then(function () {
                    return validateShardMatchesSearch(config, newEquipment.id)
                })
                .then(function (shardMatchesSearch) {
                    // as warriors are linked to equipment, both warriors and equipment will be stored on the same shard
                    shardMatchesSearch.should.be.greaterThan(1)  // expected two but there are more

                })
        })
    })

    describe('Searching With Custom Routing', function () {
        var config

        beforeEach(function seedPeople() {
            config = this.config
            this.timeout(config.esIndexWaitTime + 6000)
            return seederInstance.dropCollectionsAndSeed('equipment')
                // .then(function () {
                //     return seederInstance.dropCollectionsAndSeed('equipment')
                // })
                .then(function () {
                    // console.log('dropped people and reseeded')
                    console.log('dropped equipment and reseaded')
                    console.log('delaying for:', config.esIndexWaitTime  + 2000)
                    // return Promise.delay(config.esIndexWaitTime + 2000)
                })
                .then(function () {
                    console.log('finished beforeEach')
                })
        })

        it.skip('should still search WHEN customRouting is enabled BUT not given as a search predicate', function () {
            return $http.get(this.createOptions('/people/search?appearances=le=2000'))
                .spread(function (res, body) {
                    res.statusCode.should.equal(200)
                    body.people.should.be.an.Array
                    body.people.length.should.equal(1)
                    body.people[0].name.should.equal('Wally')
                })
        })

        it.skip('should add one custom routing value WHEN customRouting is enabled', function () {
            return $http.get(this.createOptions('/people/search?name=Dilbert'))
                .spread(function (res, body) {
                    res.statusCode.should.equal(200)
                    body.people.should.be.an.Array
                    body.people.length.should.equal(1)
                    body.people[0].should.have.property('name').and.equal('Dilbert')
                })
        })

        it.skip('should add many custom routing values WHEN custumRouting is enabled', function () {
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

