var harvesterPort = process.env.HARVESTER_PORT || 8000;

module.exports = {
    baseUrl: 'http://localhost:' + harvesterPort,
    esIndexWaitTime: parseInt(process.env.ES_INDEX_WAIT_TIME) || 3000,
    harvester: {
        port: harvesterPort,
        options: {
            adapter: 'mongodb',
            connectionString: process.env.MONGODB_URL || "mongodb://127.0.0.1:27017/ehTestDb",
            db: process.env.MONGODB || 'ehTestDb',
            inflect: true,
            oplogConnectionString: (process.env.OPLOG_MONGODB_URL || "mongodb://127.0.0.1:27017/local") + '?slaveOk=true',
            es_index: 'test-index',
            es_url: process.env.ES_URL || "http://127.0.0.1:9200"
        }
    }
};
