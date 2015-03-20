var options = {
    adapter: 'mongodb',
    connectionString: process.argv[2] || "‌mongodb://127.0.0.1:27017/testDB",
    db: 'testDB',
    inflect: true,
    es_index:'test-index',
    es_url: process.argv[3] || "http://127.0.0.1:9200"
};

module.exports= {options:options};