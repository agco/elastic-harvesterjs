module.exports={
    "people": {
        "properties": {
            "id": {
                "type": "string",
                "index": "not_analyzed"
            },
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
                            "id": {
                                "type": "string",
                                "index": "not_analyzed"
                            },
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
                                    "id": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    },
                                    "name": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    }
                                }
                            },
                            "friends": {
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
                                    "appearances": {
                                        "type": "long"
                                    },
                                    "toys": {
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
                                    },
                                    "friends": {
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
                            "id": {
                                "type": "string",
                                "index": "not_analyzed"
                            },
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
                                    "id": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            }
                                        }
                                    },
                                    "friends": {
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
                                    "id": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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
                                    "id": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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
                            "id": {
                                "type": "string",
                                "index": "not_analyzed"
                            },
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
                                    "id": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
                                            "name": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            }
                                        }
                                    },
                                    "friends": {
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
                                    "id": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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
                                    "id": {
                                        "type": "string",
                                        "index": "not_analyzed"
                                    },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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
                                            "id": {
                                                "type": "string",
                                                "index": "not_analyzed"
                                            },
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