var app = require('./app');


module.exports = function(){
    return app.apply(app,arguments)
        .then(function (harvestApp) {
            harvestApp.listen(process.env.PORT);
            return harvestApp;
        });
}