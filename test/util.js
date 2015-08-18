var Promise = require('bluebird');
var should = require('should');
var _ = require('lodash');
var request = require('supertest');

/* addLink: easily associate two documents.
   params:
        -type: type of the resource you're targeting. Should be pluralized. e.g. "pets"
        -linkObj: value of the "links" parameter being sent. e.g. "{friends: "o1sas3213ddafgsd123"}".
        -baseUrl: baseUrl of the api being hit, e.g. "http://localhost:8081"
        -url: the rest of the url of the targeted resource, e.g. "/pets/12387921213"
   returns: a promise with the result of the query
*/
function addLink(type,linkObj,baseUrl,url){
    return new Promise(function (resolve) {
        var payload = {};

        payload[type] = [
            {
                links: linkObj
            }
        ];

        request(baseUrl)
            .put(url)
            .send(payload)
            .expect('Content-Type', /json/)
            .expect(200)
            .end(function (error, response) {
                should.not.exist(error);
                var body = JSON.parse(response.text);
                _.each(Object.keys(linkObj),function(key,value,list){
                    (body[type][0].links[key]).should.match(linkObj[key]);
                });
                resolve(body);
            });
    })

}

module.exports = {addLink:addLink};
