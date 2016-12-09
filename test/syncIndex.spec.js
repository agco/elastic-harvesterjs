//dependencies
var _ = require('lodash');
var chai = require('chai');
var expect = chai.expect;
var $http = require('http-as-promised');
var Promise = require('bluebird');

//locals
var seeder = require('./seeder.js');
var fixtures = require('./fixtures')();

describe('#syncIndex', function() {
    var config;
    beforeEach(function () {
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
        var dog = fixtures['pets'][0];

        this.timeout(config.esIndexWaitTime + 10000);
        dog.name = "dogebert";  // this assignment and the syncIndex below appear to have no affect on this test...
        return this.peopleSearch.syncIndex('pets', 'update', dog)
            .delay(config.esIndexWaitTime)
            .then(function() {
                return $http.get(config.baseUrl + '/people/search?include=pets', { json: true })
            })
            .spread(function (res, body) {
                var personOfInterest;

                expect(res.statusCode).to.equal(200);
                personOfInterest = _.find(body.people, { name: 'Dilbert' });
                expect(personOfInterest.links.pets[0]).to.equal(dog.id);
            });
    });
});
