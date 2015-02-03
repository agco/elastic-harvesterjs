module.exports = {
    "people": {
        "properties": {
            "name": {
                "type": "string",
                "index": "not_analyzed"
            },
            "appearances": {
                "type": "long"
            },
            "links": {
                "type": "nested",
                "properties": {
                    "pets": {
                        "type": "nested",
                        "properties": {
                            "name": {
                                "type": "string",
                                "index": "not_analyzed"
                            },
                            "appearances": {
                                "type": "long"
                            },
                            "links": {
                                "type": "nested",
                                "properties": {
                                    "toys": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "soulmate": {
                        "type": "nested",
                        "properties": {
                            "name": {
                                "type": "string",
                                "index": "not_analyzed"
                            },
                            "appearances": {
                                "type": "long"
                            },
                            "links": {
                                "type": "nested",
                                "properties": {
                                    "pets": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
                                            },
                                            "links": {
                                                "type": "nested",
                                                "properties": {
                                                    "toys": {
                                                        "type": "nested",
                                                        "properties": {
                                                            "name": {
                                                                "type": "string",
                                                                "index": "not_analyzed"
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    "soulmate": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
                                            },
                                            "links": {
                                                "type": "nested",
                                                "properties": {
                                                    "pets": {
                                                        "type": "nested",
                                                        "properties": {

                                                        }
                                                    },
                                                    "soulmate": {
                                                        "type": "nested",
                                                        "properties": {

                                                        }
                                                    },
                                                    "lovers": {
                                                        "type": "nested",
                                                        "properties": {

                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    "lovers": {
                                        "type": "nested",
                                        "properties": {

                                        }
                                    }
                                }
                            }
                        }
                    },
                    "lovers": {
                        "type": "nested",
                        "properties": {

                        }
                    }
                }
            }
        }
    }
};