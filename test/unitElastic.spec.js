var should = require('should');
var _ = require('lodash');
var request = require('supertest');
var Promise = require('bluebird');

describe("Unit test ElasticHarvester", function () {
  before(function () {
      config = this.config;
      harvester = this.harvesterApp;
      elastic = this.peopleSearch;
  });

  it('should be able to skip empty linked documents', function (done) {
    Promise.resolve(
      harvester.adapter._models.pet.findOneAndUpdate(
      { name: 'Dogbert' },
      { name: "" }).exec())
      .then(function() {
          return elastic.expandEntity({
            "_id" : "d5849b05-2fe9-4fee-82a6-ed1c29b3455b",
            "name" : "Dilbert Jr",
            "appearances" : "34574",
            "dateOfBirth" : "1984-07-10T12:18:51.000-03:00",
            "links" : {
              "pets" : "b767ffc1-0ab6-11e5-a3f4-470467a3b6a8"
            }
        },1);
      }
    ).then(function(result) {
        (result.name).should.equal("Dilbert Jr");
        (result.pets.id).should.equal("b767ffc1-0ab6-11e5-a3f4-470467a3b6a8");
        should.not.exist(result.pets.name);
        done();
      });
  });
});
