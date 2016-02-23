var inflect = require('i')();
var should = require('should');
var _ = require('lodash');
var request = require('supertest');
var Promise = require('bluebird');
var fixtures = require('./fixtures');
var seeder = require('./seeder.js');


describe('aggregations', function () {

    var config, ids;
    before(function () {
        config = this.config;
        this.timeout(config.esIndexWaitTime + 1000);
        return seeder(this.harvesterApp).dropCollectionsAndSeed(false, 'people', 'pets').then(function (result) {
            ids = result;
        }).then(function () {
                var payload = {};

                payload.people = [
                    {
                        links: {
                            pets: [ids.pets[0]]
                        }
                    }
                ];

                return new Promise(function (resolve, reject) {
                    request(config.baseUrl).put('/people/' + ids.people[0]).send(payload).expect('Content-Type', /json/).expect(200).end(function (error,
                                                                                                                                                   response) {
                        should.not.exist(error);
                        if (error) {
                            reject(error);
                            return;
                        }
                        var body = JSON.parse(response.text);
                        (body.people[0].links.pets).should.containEql(ids.pets[0]);
                        resolve();
                    });
                });
            }).then(function () {
                return Promise.delay(config.esIndexWaitTime);
            });
    });

    describe('range', function () {
        it('should be able to do range aggregations, specify adhoc ranges & get back corresponding buckets', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=appearance_range&appearance_range.type=range&appearance_range.property=appearances&appearance_range.ranges=*-99,100-199,500-599,600-*&limit=0').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                console.log(JSON.stringify(body));
                should.exist(body.meta.aggregations.appearance_range);
                (body.meta.aggregations.appearance_range.length).should.equal(4);//because there are 4 ranges specified.
                done();
            });
        });

    });

    describe('terms', function () {
        it('should keep simple backwards compatibility with original terms aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations.fields=name').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.meta.aggregations.name);
                (body.meta.aggregations.name.length).should.equal(fixtures().people.length);
                done();
            });
        });

        it('should be possible to do a level 1 terms aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=name_agg&name_agg.type=terms&name_agg.property=name').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.meta.aggregations.name_agg);
                (body.meta.aggregations.name_agg.length).should.equal(fixtures().people.length);
                var names = {};
                _.each(body.meta.aggregations.name_agg, function (value) {
                    names[value["key"]] = true;
                });
                _.each(fixtures().people, function (person) {
                    should.exist(names[person.name]);
                });
                done();
            });
        });
    });

    describe('date histogram', function () {

        it('should be able to do generate histogram buckets for an interval(months)', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=dob_histo&dob_histo.type=date_histogram&dob_histo.property=dateOfBirth&dob_histo.interval=month&limit=0').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.meta.aggregations.dob_histo);

                (body.meta.aggregations.dob_histo.length).should.equal(fixtures().people.length);
                _.each(body.meta.aggregations.dob_histo,function(bucket){
                    should.exist(bucket.key);
                    should.exist(bucket.key_as_string);
                    should.exist(bucket.count);
                });
                done();
            });
        });

        it('should be able to put histogram buckets into correct timezones', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=dob_histo&dob_histo.type=date_histogram&dob_histo.property=dateOfBirth&dob_histo.interval=month&dob_histo.timezone=-3:00&limit=0').expect(200).end(function (err, res) {
                var timezoneShiftedBody = JSON.parse(res.text);
                should.exist(timezoneShiftedBody.meta.aggregations.dob_histo);
                (timezoneShiftedBody.meta.aggregations.dob_histo.length).should.equal(fixtures().people.length);
                _.each(timezoneShiftedBody.meta.aggregations.dob_histo,function(bucket){
                    should.exist(bucket.key);
                    should.exist(bucket.key_as_string);
                    should.exist(bucket.count);
                });
                done();

            });
        });

    });

    describe('extended stats', function () {
        //TODO: Skipping because it's not working on travis but works in prod,dev & test. Suspect a ES version issue -
        it.skip('should be able to do sigmas & get correct std deviation in extended stats', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=appearance_ext_stats&appearance_ext_stats.type=extended_stats&appearance_ext_stats.property=appearances&appearance_ext_stats.sigma=1&limit=0').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.meta.aggregations.appearance_ext_stats);
                (body.meta.aggregations.appearance_ext_stats.count).should.equal(fixtures().people.length);
                var stDeviation = standardDeviation(_.pluck(fixtures().people,"appearances"));
                var avg = average(_.pluck(fixtures().people,"appearances"));
                (body.meta.aggregations.appearance_ext_stats.std_deviation).should.equal(stDeviation);
                (body.meta.aggregations.appearance_ext_stats.std_deviation_bounds.upper).should.equal(avg+stDeviation);
                (body.meta.aggregations.appearance_ext_stats.std_deviation_bounds.lower).should.equal(avg-stDeviation);
                done();
            });
        });
    });


    describe('top_hits', function () {
        it('should be possible to do a level 1 top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1').expect(200).end(function (err,
                                                                                                                                                                                         res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.meta.aggregations.mostpopular);
                (body.meta.aggregations.mostpopular.length).should.equal(1);
                var max_appearances = 0;
                _.each(fixtures().people, function (person) {
                    person.appearances > max_appearances && (max_appearances = person.appearances);
                });
                (body.meta.aggregations.mostpopular[0].appearances).should.equal(max_appearances);
                done();
            });
        });

        it('should be possible to specify which fields are returned by a level 1 top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.fields=name').expect(200).end(function (err,
                                                                                                                                                                                                                 res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.meta.aggregations.mostpopular);
                (body.meta.aggregations.mostpopular.length).should.equal(1);
                (Object.keys(body.meta.aggregations.mostpopular[0]).length).should.equal(1);

                var max_appearances = 0;
                var max_appearances_name = "";
                _.each(fixtures().people, function (person) {
                    person.appearances > max_appearances && (max_appearances = person.appearances) && (max_appearances_name = person.name);
                });
                (body.meta.aggregations.mostpopular[0].name).should.equal(max_appearances_name);
                done();
            });
        });

        it('should be possible to have linked documents returned by a level 1 top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?limit=10000&aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1000&mostpopular.include=pets').expect(200).end(function (err,
                                                                                                                                                                                                                                 res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked);
                should.exist(body.linked.pets);
                (body.linked.pets.length).should.equal(1);
                (body.linked.pets[0].id).should.equal(ids.pets[0]);
                done();
            });
        });

        it('should be possible to have linked documents returned by a level N top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=n&n.property=name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets').expect(200).end(function (err,
                                                                                                                                                                                                                                                   res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked.pets);
                (body.linked.pets.length).should.equal(1);
                (body.linked.pets[0].id).should.equal(ids.pets[0]);
                done();
            });
        });

        it('should dedupe linked documents returned by both a level N top_hits aggregation & the harvest-provided include', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=n&n.property=name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets&include=pets').expect(200).end(function (err,
                                                                                                                                                                                                                                                                res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked.pets);
                (body.linked.pets.length).should.equal(1);
                done();
            });
        });

        //Skipping for now; this test requires an es_mapping to be provided.
        it.skip('should be possible to have linked documents returned in a nested, then un-nested N level top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=n&n.property=links.pet.name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets').expect(200).end(function (err,
                                                                                                                                                                                                                                                             res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked.pets);
                console.log(body)
                (body.linked.pets.length).should.equal(1);
                (body.linked.pets[0].id).should.equal(ids.pets[0]);
                done();
            });
        });

        it('should be able to remove linked documents', function (done) {
            request(config.baseUrl).patch('/people/' + ids.people[0]).send([
                    {path: '/people/0/links/pets', op: 'replace', value: []}
                ]).expect('Content-Type', /json/).expect(200).end(function (error, response) {
                    should.not.exist(error);
                    var body = JSON.parse(response.text);
                    should.not.exist(body.people[0].links);
                    done();
                });
        });
    });

    describe.skip('Sampling in conjunction with aggs', function () {
        it('should be possible to do a level 1 top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&script=sampler&script.maxSamples=1').expect(200).end(function (err,
                                                                                                                                                                                         res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                body.people.length.should.equal(1);
                should.exist(body.meta.aggregations.mostpopular);
                (body.meta.aggregations.mostpopular.length).should.equal(1);
                var max_appearances = 0;
                _.each(fixtures().people, function (person) {
                    person.appearances > max_appearances && (max_appearances = person.appearances);
                });
                (body.meta.aggregations.mostpopular[0].appearances).should.equal(max_appearances);
                done();
            });
        });

        it('should be possible to specify which fields are returned by a level 1 top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.fields=name&script=sampler&script.maxSamples=1').expect(200).end(function (err,
                                                                                                                                                                                                                 res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                body.people.length.should.equal(1);
                should.exist(body.meta.aggregations.mostpopular);
                (body.meta.aggregations.mostpopular.length).should.equal(1);
                (Object.keys(body.meta.aggregations.mostpopular[0]).length).should.equal(1);

                var max_appearances = 0;
                var max_appearances_name = "";
                _.each(fixtures().people, function (person) {
                    person.appearances > max_appearances && (max_appearances = person.appearances) && (max_appearances_name = person.name);
                });
                (body.meta.aggregations.mostpopular[0].name).should.equal(max_appearances_name);
                done();
            });
        });

        it('should be possible to have linked documents returned by a level 1 top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?limit=10000&aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1000&mostpopular.include=pets&script=sampler&script.maxSamples=1').expect(200).end(function (err,
                                                                                                                                                                                                                                 res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                should.exist(body.linked);
                should.exist(body.linked.pets);
                (body.linked.pets.length).should.equal(1);
                (body.linked.pets[0].id).should.equal(ids.pets[0]);
                done();
            });
        });

        it('should be possible to have linked documents returned by a level N top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=n&n.property=name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets&script=sampler&script.maxSamples=1').expect(200).end(function (err,
                                                                                                                                                                                                                                                   res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                body.people.length.should.equal(1);
                should.exist(body.linked.pets);
                (body.linked.pets.length).should.equal(1);
                (body.linked.pets[0].id).should.equal(ids.pets[0]);
                done();
            });
        });

        it('should dedupe linked documents returned by both a level N top_hits aggregation & the harvest-provided include', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=n&n.property=name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets&include=pets&script=sampler&script.maxSamples=1').expect(200).end(function (err,
                                                                                                                                                                                                                                                                res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                body.people.length.should.equal(1);
                should.exist(body.linked.pets);
                (body.linked.pets.length).should.equal(1);
                done();
            });
        });

        //Skipping for now; this test requires an es_mapping to be provided.
        it.skip('should be possible to have linked documents returned in a nested, then un-nested N level top_hits aggregation', function (done) {
            request(config.baseUrl).get('/people/search?aggregations=n&n.property=links.pet.name&n.aggregations=mostpopular&mostpopular.type=top_hits&mostpopular.sort=-appearances&mostpopular.limit=1&mostpopular.include=pets&script=sampler&script.maxSamples=1').expect(200).end(function (err,
                                                                                                                                                                                                                                                             res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                body.people.length.should.equal(1);
                should.exist(body.linked.pets);
                console.log(body)
                (body.linked.pets.length).should.equal(1);
                (body.linked.pets[0].id).should.equal(ids.pets[0]);
                done();
            });
        });

        it('should be able to remove linked documents', function (done) {
            request(config.baseUrl).patch('/people/' + ids.people[0]).send([
                    {path: '/people/0/links/pets', op: 'replace', value: []}
                ]).expect('Content-Type', /json/).expect(200).end(function (error, response) {
                    should.not.exist(error);
                    var body = JSON.parse(response.text);
                    should.not.exist(body.people[0].links);
                    done();
                });
        });
    });

    describe.skip('Sampling', function() {
        beforeEach(function() {
            this.timeout(config.esIndexWaitTime + 10000);
            return seeder(this.harvesterApp).dropCollections('people')
            .then(function() {
                var people = _.times(10, function(index) {
                    return {
                        name : 'name' + index,
                        "appearances": 3457,
                        id: 'b767ffc1-0ab6-11e5-a3f4-470467a3b6a' + index
                    };
                });

                return seeder(this.harvesterApp).post('people', people);
            }.bind(this))
            .then(function (res) {
                return Promise.delay(config.esIndexWaitTime + 1000);
            })
        });

        it('should return 3 results of 10 when max sampled is 3', function (done) {
            this.timeout(config.esIndexWaitTime + 10000);
            request(config.baseUrl).get('/people/search?script=sampler&script.maxSamples=3').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                body.people.length.should.equal(3);
                done();
            });
        });

        it('should return 5 results of 10 when max sampled is 5', function (done) {
            this.timeout(config.esIndexWaitTime + 10000);
            request(config.baseUrl).get('/people/search?script=sampler&script.maxSamples=5').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                body.people.length.should.equal(5);
                done();
            });
        });

        it('should return 10 results of 10 when max sampled is 10', function (done) {
            this.timeout(config.esIndexWaitTime + 10000);
            request(config.baseUrl).get('/people/search?script=sampler&script.maxSamples=10').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                body.people.length.should.equal(10);
                done();
            });
        });

        it('should return 10 results of 10 when max sampled is 15', function (done) {
            this.timeout(config.esIndexWaitTime + 10000);
            request(config.baseUrl).get('/people/search?script=sampler&script.maxSamples=15').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                body.people.length.should.equal(10);
                done();
            });
        });
    });

describe.skip('Sampling with filters', function() {
        beforeEach(function() {
            this.timeout(config.esIndexWaitTime + 10000);
            return seeder(this.harvesterApp).dropCollections('people')
            .then(function() {
                var people = _.times(10, function(index) {
                    return {
                        name : 'name' + index,
                        "appearances": 3457,
                        id: 'b767ffc1-0ab6-11e5-a3f4-470467a3b6a' + index
                    };
                });

                people = people.concat(_.times(2, function(index) {
                    return {
                        name : 'namex',
                        "appearances": 3457,
                        id: 'b767ffc1-0ab6-11e5-a3f4-470467a3b6b' + index
                    };
                }));

                people = people.concat(_.times(10, function(index) {
                    return {
                        name : 'namey',
                        "appearances": 3457,
                        id: 'b767ffc1-0ab6-11e5-a3f4-470467a3b6c' + index
                    };
                }));

                return seeder(this.harvesterApp).post('people', people);
            }.bind(this))
            .then(function (res) {
                return Promise.delay(config.esIndexWaitTime + 1000);
            })
        });

        it('should return 2 results of 10 when max sampled is 3', function (done) {
            this.timeout(config.esIndexWaitTime + 10000);
            request(config.baseUrl).get('/people/search?name=namex&script=sampler&script.maxSamples=3').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                body.people.length.should.equal(2);
                done();
            });
        });

        it('should return 5 results of 10 when max sampled is 5', function (done) {
            this.timeout(config.esIndexWaitTime + 10000);
            request(config.baseUrl).get('/people/search?name=namey&script=sampler&script.maxSamples=5').expect(200).end(function (err, res) {
                should.not.exist(err);
                var body = JSON.parse(res.text);
                body.people.length.should.equal(5);
                done();
            });
        });
    });
});

function standardDeviation(values){
    var avg = average(values);

    var squareDiffs = values.map(function(value){
        var diff = value - avg;
        var sqrDiff = diff * diff;
        return sqrDiff;
    });

    var avgSquareDiff = average(squareDiffs);

    var stdDev = Math.sqrt(avgSquareDiff);
    return stdDev;
}

function average(data){
    var sum = data.reduce(function(sum, value){
        return sum + value;
    }, 0);

    var avg = sum / data.length;
    return avg;
}