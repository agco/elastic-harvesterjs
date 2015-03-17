# Elastic-Search Tools (non-functionals)

Non-functionals are lightweight tools that help manage elastic-search clusters deployed for use with elastic-harvester.

## Features

- Mapper : Get, add, delete, and update elastic-search mappings.
- Reloader : Reload an elastic-search index from a syncronized mongo-powered harvester endpoint.

## Installation

Clone the elastic-harvester repo and do npm install

## Usage

Terms & Examples:

{ES_SERVER_URL} e.g. http://localhost:9200
{ES_INDEX} e.g. dealer-api
{ES_TYPE} e.g. dealers
{PATH-TO-NEW-MAPPING-JSON-FILE} e.g. ../test/test.mapping.js

#### Mapper
_Elastic-Search mapping helper_

Get, add, delete, and update elastic-search mappings.
Meant to be run @cmd line, but can also be required and used in code.


- ADD
Usage: node mapper.js add {ES_SERVER_URL} {ES_INDEX} {ES_TYPE} {PATH-TO-NEW-MAPPING-JSON-FILE}
- GET
Usage: node mapper.js get {ES_SERVER_URL} {ES_INDEX}
- UPDATE (destructive, *causes data loss to entire index*)
Usage: node mapper.js update {ES_SERVER_URL} {ES_INDEX} {ES_TYPE} {PATH-TO-NEW-MAPPING-JSON-FILE}
- DELETE (destructive)
Usage: node mapper.js delete {ES_SERVER_URL} {ES_INDEX}

#### Reloader

_Elastic-Search index reloader_

Reload elastic-search index from a syncronized mongo-powered harvester endpoint.
Meant to be run @cmd line, but can also be required and used in code.

- RELOAD
Usage: node reloader.js {ES_SERVER_URL} {ES_TYPE}

NB: {ES_TYPE} is optional. If not specified, defaults to the part of the url after the last "/".


## Roadmap

- Add tool for generating scaffolded mappings.
