module.exports = {
    "warriors": {
        "properties": {
            "id": {
                "type": "string",
                "index": "not_analyzed"
            },
            "name": {
                "type": "string",
                "index": "not_analyzed"
            },
            "links": {
                "type": "nested",
                "properties": {
                    "weapon": {
                        "type": "nested",
                        "properties": {
                            "id": {
                                "type": "string",
                                "index": "not_analyzed"
                            },
                            "name": {
                                "type": "string",
                                "index": "not_analyzed"
                            },
                            "dealer": {
                                "type": "nested",
                                "properties": {
                                    "id": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};
