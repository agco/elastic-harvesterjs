module.exports={
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
                            "toys": {
                                "type": "nested",
                                "properties": {
                                    "name": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    }
                                }
                            },
                            "friends": {
                                "type": "nested",
                                "properties": {
                                    "name": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    },
                                    "appearances": {
                                        "type": "long"
                                    },
                                    "toys": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            }
                                        }
                                    },
                                    "friends": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
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
                                    "toys": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            }
                                        }
                                    },
                                    "friends": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
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
                                    "pets": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
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
                                            }
                                        }
                                    },
                                    "lovers": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
                                            }
                                        }
                                    }
                                }
                            },
                            "lovers": {
                                "type": "nested",
                                "properties": {
                                    "name": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    },
                                    "appearances": {
                                        "type": "long"
                                    },
                                    "pets": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
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
                                            }
                                        }
                                    },
                                    "lovers": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "lovers": {
                        "type": "nested",
                        "properties": {

                            "name": {
                                "type": "string",
                                "index": "not_analyzed"
                            },
                            "appearances": {
                                "type": "long"
                            },
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
                                    "toys": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            }
                                        }
                                    },
                                    "friends": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
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
                                    "pets": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
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
                                            }
                                        }
                                    },
                                    "lovers": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
                                            }
                                        }
                                    }
                                }
                            },
                            "lovers": {
                                "type": "nested",
                                "properties": {
                                    "name": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    },
                                    "appearances": {
                                        "type": "long"
                                    },
                                    "pets": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
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
                                            }
                                        }
                                    },
                                    "lovers": {
                                        "type": "nested",
                                        "properties": {
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "appearances": {
                                                "type": "long"
                                            }
                                        }
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