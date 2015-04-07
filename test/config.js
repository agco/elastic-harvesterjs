var options = {
    adapter: 'mongodb',
    connectionString: process.argv[2] || "mongodb://127.0.0.1:27017/ehTestDb",
    db: 'ehTestDb',
    inflect: true,
    es_index:'test-index',
    es_url: process.argv[3] || "http://127.0.0.1:9200"
};

options.oplogConnectionString = getMongoDbServerUrl(options.connectionString) +"local";

function getMongoDbServerUrl(connectionString){
    var index = connectionString.lastIndexOf('/');
    if (index == connectionString.length-1){
        return getMongoDbServerUrl(connectionString.substr(0,connectionString.length-1))
    }else if (index == -1){
        throw new Error("mongo connectionString is not correctly defined.");
    }else{
        return connectionString.substr(0,index+1);
    }
}

module.exports= {options:options};