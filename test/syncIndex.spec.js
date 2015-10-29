//dependencies
var chai = require('chai');
var expect = chai.expect;
var $http = require('http-as-promised');
var Promise = require('bluebird');

//locals
var seeder = require('./seeder.js');
var fixtures = require('./fixtures')();

describe('#syncIndex', function() {
    var config;
    before(function () {
        config = this.config;
        this.timeout(config.esIndexWaitTime + 10000);
        return seeder(this.harvesterApp).dropCollectionsAndSeed('people', 'pets')
            .then(linkPeopleWithPets);

        function linkPeopleWithPets() {
            var payload = {
                    people: [
                        {
                            links: {
                                pets: [fixtures.pets[0].id]
                            }
                        }
                    ]
                };

            return $http.put(config.baseUrl + '/people/' + fixtures.people[0].id, {json: payload})
                .spread(function(res) {
                    expect(res.statusCode).to.equal(200);
                    return Promise.delay(config.esIndexWaitTime);
                });
        }
    });

    it('has valid people data', function() {
        return $http.get(config.baseUrl+'/people/search?include=pets', {json: true}).spread(function(res) {
            expect(res.statusCode).to.equal(200);
        });
    });

    it('works!', function() {
        this.timeout(config.esIndexWaitTime + 10000);
        var dog = fixtures['pets'][0];
        dog.name = "dogebert";
        return this.peopleSearch.syncIndex('pets', 'update', dog)
            .delay(config.esIndexWaitTime)
            .then(function() {
                return $http.get(config.baseUrl+'/people/search?include=pets', {json: true})
            })
            .spread(function(res, body) {
                var pet = body.people[1].links.pets[0];
                expect(res.statusCode).to.equal(200);
            });
    });
});
