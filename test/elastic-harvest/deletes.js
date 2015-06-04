var should = require('should');
var _ = require('lodash');
var $http = require('http-as-promised');
var Promise = require('bluebird');
var addLink = require('./util').addLink;
var fixtures = require('../fixtures');

module.exports = function(baseUrl,keys,ids) {
    function giveDilbertAPet(){
        var ratbertsId = ids["pets"][0];
        var dilbertsId = ids["people"][0];
        var dilbertsPetsLinkage = {pets: [ratbertsId]};

        return addLink("people",dilbertsPetsLinkage, baseUrl,'/people/' + dilbertsId);
    }
    function giveDilbertASoulmate(){
        var wallysId = ids["people"][1];
        var dilbertsId = ids["people"][0];
        var dilbertsSoulmateLinkage = {soulmate: wallysId};
        return addLink("people",dilbertsSoulmateLinkage, baseUrl,'/people/' + dilbertsId);
    }

    function killRatbert(){
        var ratbertsId = ids["pets"][0];
        return $http.del(baseUrl+"/pets/"+ratbertsId,{json:{}});
    }

    function reviveRatbert(){
        var ratbertsFixture = fixtures["pet"][0];
        return $http.post({url:baseUrl+"/pets/",json:{pets:[ratbertsFixture]}})
            .then(function(resp){
                var body = resp[1];
                ids["pets"][0] = body.pets[0].id;
            })
    }

    function killDilbert(){
        var dilbertsId = ids["people"][0];
        return $http.del(baseUrl+"/people/"+dilbertsId,{json:{}})
        .finally(function(res) {
        })
    }

    function reviveDilbert(){
        var dilbertsFixture = fixtures["person"][0];
        return $http.post({url:baseUrl+"/people/",json:{people:[dilbertsFixture]}})
            .then(function(resp){
                    var body = resp[1];
                    ids["people"][0] = body.people[0].id;
                })
    }

    describe("deletes", function() {

        it("Should correctly sync non-primary resource deletes",function(){
            var id = ids.people[0];
            return Promise.resolve()
                .then(function(){
                    return giveDilbertAPet();
                })
                .then(function(body){
                    should.exist(body.people);
                    body.people.length.should.equal(1);
                    should.exist(body.people[0].links.pets);
                    return Promise.delay(2000);
                })
                .then(function(){
                    return $http.get(baseUrl+"/people/search?id="+id)
                })
                .spread(function(res,body){
                    body = JSON.parse(body);
                    should.exist(body.people);
                    body.people.length.should.equal(1);
                    should.exist(body.people[0].links.pets);
                })
                .then(function(){
                    return $http.patch({url:baseUrl+"/people/"+id,json:[{path: '/' + keys.person + '/0/links/pets', op: 'replace', value: []}]})
                })
                .spread(function(res,body){
                    res.statusCode.should.equal(200);
                    should.exist(body.people);
                    body.people.length.should.equal(1);
                    should.not.exist(body.people[0].links);
                    return Promise.delay(2000);
                })
                .then(function(){
                    return $http.get(baseUrl+"/people/search?id="+id)
                })
                .spread(function(res,body){
                    res.statusCode.should.equal(200);
                    body = JSON.parse(body);
                    should.exist(body.people);
                    body.people.length.should.equal(1);
                    should.not.exist(body.people[0].links);
                })
        });

        it("Should correctly sync primary resource deletes",function(){
            var id = ids.people[0];

            return $http.get(baseUrl+"/people/search?id="+id)
                .spread(function(res,body){
                    res.statusCode.should.equal(200);
                    body = JSON.parse(body);
                    should.exist(body.people);
                    body.people.length.should.equal(1);
                })
                .then(function(){
                    return killDilbert();
                })

                .spread(function(res,body){
                    res.statusCode.should.equal(204);
                    return Promise.delay(2000);
                })
                .then(function(){
                    delete ids.people[0];
                    return $http.get(baseUrl+"/people/search?id="+id)
                })
                .spread(function(res,body){
                    body = JSON.parse(body);
                    should.exist(body.people);
                    body.people.length.should.equal(0);
                })
                .then(function(){
                    return reviveDilbert();
                })
        });


        it("Should correctly sync resources with invalid data graphs",function(){
            var id = ids.people[0];
            return Promise.resolve()
                .then(function(){
                    return Promise.all([giveDilbertAPet(),giveDilbertASoulmate()]);
                })
                .then(function(){
                    return Promise.delay(2000);
                })
                .then(function(){
                    return $http.get(baseUrl+"/people/search?id="+id)
                })
                .spread(function(res,body){
                    body = JSON.parse(body);
                    should.exist(body.people);
                    body.people.length.should.equal(1);
                    should.exist(body.people[0].links.pets);
                    should.exist(body.people[0].links.soulmate);
                })
                .then(function(){
                    return killRatbert();
                })
                .spread(function(res,body){
                    res.statusCode.should.equal(204);
                    return Promise.delay(2000);
                })
                .then(function(){
                    return $http.get(baseUrl+"/people/search?id="+id)
                })
                .spread(function(res,body){
                    var ratbertsId = ids["pets"][0];
                    var wallysId = ids["people"][1];

                    res.statusCode.should.equal(200);
                    body = JSON.parse(body);
                    should.exist(body.people);
                    body.people.length.should.equal(1);
                    should.exist(body.people[0].links);
                    should.exist(body.people[0].links.pets);
                    should.exist(body.people[0].links.soulmate);
                    wallysId.should.equal(body.people[0].links.soulmate);
                    (_.contains(body.people[0].links.pets,ratbertsId)).should.be.false;

                })
                .then(function(){
                    return reviveRatbert();
                })
        });
    });
};