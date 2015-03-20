var app = require('./app');


module.exports = function(a,b,c){
    return app(a,b,c)
        .then(function (harvestApp) {
            harvestApp.listen(process.env.PORT);
            return harvestApp;
        });
}