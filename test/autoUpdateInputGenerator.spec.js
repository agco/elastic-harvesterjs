var inflect = require('i')();
var should = require('should');
var _ = require('lodash');
var autoUpdateInputGenerator = new (require("../autoUpdateInputGenerator"))();

describe('autoUpdateInputGenerator', function () {
    it('should be able to scaffold the input for autoUpdates of a harvestApp\'s schema', function (done) {

        return autoUpdateInputGenerator.generateInput(this.harvesterApp, "people", "generated.test-created.input.json").then(function (results) {
            var expectedResults = {
                "links.pets.id": "pet",
                "links.pets.toys.id": "toy",
                "links.pets.friends.id": "pet",
                "links.soulmate.id": "person",
                "links.soulmate.pets.id": "pet",
                "links.soulmate.soulmate.id": "person",
                "links.soulmate.lovers.id": "person",
                "links.lovers.id": "person",
                "links.lovers.pets.id": "pet",
                "links.lovers.soulmate.id": "person",
                "links.lovers.lovers.id": "person"
            };

            _.each(expectedResults, function (value, key) {
                should.exist(results[key]);
                results[key].should.equal(value);
            });
            done();
        });
    });
});
