module.exports={
    "equipment": {
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
                    "dealer": {
                        "type": "nested",
                        "properties": {
                            "id": {
                                "type": "string",
                                "index": "not_analyzed"
                            },
                            "name": {
                                "type": "string",
                                "index": "not_analyzed"
                            }
                        }
                    }
                }
            }
        }
    }
};
