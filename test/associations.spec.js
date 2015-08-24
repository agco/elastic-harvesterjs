var should = require('should');
var Promise = require('bluebird');
var request = require('supertest');
var addLink = require('./util').addLink;

var seeder = require('./seeder.js');

describe('associations', function () {

    var config, ids;
    before(function () {
        config = this.config;
        this.timeout(config.esIndexWaitTime + 1000);
        return seeder(this.harvesterApp).dropCollectionsAndSeed('people', 'pets').then(function (result) {
            ids = result;
        });
    });

    it('should be able to add circularly linked documents', function (done) {
        this.timeout(config.esIndexWaitTime + 1000);
        var linkObj1 = {friends: [ids.pets[1]]};
        var linkObj2 = {friends: [ids.pets[0]]};
        var linkObj3 = {pets: [ids.pets[0]]};

        var promises = [];
        //lets make friends!
        promises.push(addLink('pets', linkObj1, config.baseUrl, '/pets/' + ids.pets[0]));
        promises.push(addLink('pets', linkObj2, config.baseUrl, '/pets/' + ids.pets[1]));

        Promise.all(promises).then(function () {
            //Now trigger re-index & expansion of a person.
            addLink('people', linkObj3, config.baseUrl, '/people/' + ids.people[0]).then(function () {
                setTimeout(function () {

                    request(config.baseUrl).get('/people/search?links.pets.friends.friends.id=' + ids.pets[0]).expect('Content-Type',
                            /json/).expect(200).end(function (error, response) {
                            should.not.exist(error);
                            var body = JSON.parse(response.text);
                            (body["people"][0].id.should.match(ids.people[0]));
                            done();
                        });

                }, config.esIndexWaitTime);
            });
        });
    });
});
