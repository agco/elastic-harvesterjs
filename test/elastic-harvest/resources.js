var inflect= require('i')();
var should = require('should');
var _ = require('lodash');
var RSVP = require('rsvp');
var request = require('supertest');
var addLink = require('./util').addLink;
var Promise = RSVP.Promise;
var fixtures = require('./../fixtures.json');

module.exports = function(baseUrl,keys,ids,ES_INDEX_WAIT_TIME) {
    describe('resources', function () {

        //describe('getting a list of resources', function () {
        //    _.each(fixtures, function (resources, collection) {
        //        var key = keys[collection];
        //
        //        it('in collection "' + key + '"', function (done) {
        //            request(baseUrl)
        //                .get('/' + key)
        //                .expect('Content-Type', /json/)
        //                .expect(200)
        //                .end(function (error, response) {
        //                    should.not.exist(error);
        //                    var body = JSON.parse(response.text);
        //                    ids[key].forEach(function (id) {
        //                        _.contains(_.pluck(body[key], 'id'), id).should.equal(true);
        //                    });
        //                    done();
        //                });
        //        });
        //    });
        //});
        //
        //describe('getting each individual resource', function () {
        //    _.each(fixtures, function (resources, collection) {
        //        var key = keys[collection];
        //
        //        it('in collection "' + key + '"', function (done) {
        //            RSVP.all(ids[key].map(function (id) {
        //                return new Promise(function (resolve) {
        //                    request(baseUrl)
        //                        .get('/' + key + '/' + id)
        //                        .expect('Content-Type', /json/)
        //                        .expect(200)
        //                        .end(function (error, response) {
        //                            should.not.exist(error);
        //                            var body = JSON.parse(response.text);
        //                            body[key].forEach(function (resource) {
        //                                (resource.id).should.equal(id);
        //                            });
        //                            resolve();
        //                        });
        //                });
        //            })).then(function () {
        //                done();
        //            });
        //        });
        //    });
        //});


        it('should be able to add circularly linked documents', function (done) {
            var linkObj1 = {friends: [ids[keys.pet][1]]};
            var linkObj2 = {friends: [ids[keys.pet][0]]};
            var linkObj3 = {pets: [ids[keys.pet][0]]};

            var promises = [];
            //lets make friends!
            promises.push(addLink(keys.pet,linkObj1,baseUrl,'/' + keys.pet + '/' + ids[keys.pet][0]));
            promises.push(addLink(keys.pet,linkObj2,baseUrl,'/' + keys.pet + '/' + ids[keys.pet][1]));

            RSVP.all(promises).then(function(responses){
                //Now trigger re-index & expansion of a person.
                addLink(keys.person,linkObj3,baseUrl,'/' + keys.person + '/' + ids[keys.person][0]).then(function(response){
                    setTimeout(function(){

                        request(baseUrl)
                            .get('/people/search?links.pets.friends.friends.id='+ids[keys.pet][0])
                            .expect('Content-Type', /json/)
                            .expect(200)
                            .end(function (error, response) {
                                should.not.exist(error);
                                var body = JSON.parse(response.text);
                                (body["people"][0].id.should.match(ids[keys.person][0]));
                                done();
                            });

                    },ES_INDEX_WAIT_TIME);
                });
            });
        });
    });
}