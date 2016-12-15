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
            _singletonCache._cache[collectionName] = _singletonCache._cache[collectionName] || {};
            if (_singletonCache._cache[collectionName][id]) {
                return Promise.resolve(_singletonCache._cache[collectionName][id]);
            }
            return _singletonCache._adapter.find(collectionName, id)
                .then(function (doc) {
                    if (doc) _singletonCache._cache[collectionName][id] = doc;
                    return doc;
                })
        },
        findMany: function (collectionName, ids) {
            return _singletonCache._adapter.findMany(collectionName, ids);
        },
        clear: function () {
            _singletonCache._cache = {};
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

