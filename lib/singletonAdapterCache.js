/**
 * A module for a simple SINGLETON in memory cache for the harvesterApp#adapter.
 *
 */

// dependencies
const Promise = require('bluebird');


var _singletonCache;


function _createCache(adapter) {
    return {
        _adapter: adapter,
        _cache: {},
        find: function (collectionName, id) {
            var _this = this;
            this._cache[collectionName] = this._cache[collectionName] || {};
            if (this._cache[collectionName][id]) {
                return Promise.resolve(this._cache[collectionName][id]);
            }
            return this._adapter.find(collectionName, id)
                .then(function (doc) {
                    if (doc) _this._cache[collectionName][id] = doc;
                    return doc;
                })
        },
        findMany: function (collectionName, ids) {
            return this._adapter.findMany(collectionName, ids);
        },
        clear: function () {
            this._cache = {};
        }
    }
}


module.exports = {
    initCache: function (harvesterAppAdapter) {
        if (_singletonCache) return console.warn('Cache instance already created. You should probably use getInstance() to access it');
        _singletonCache = _createCache(harvesterAppAdapter);
    },
    getInstance: function () {
        if (!_singletonCache) throw new Error('Cache instance must be initialised by providing an harvesterApp#adapter to the cache.');
        return _singletonCache;
    }
};

