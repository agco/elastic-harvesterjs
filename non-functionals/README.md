# Elastic-Search Tools (non-functionals)

Non-functionals are lightweight tools that help manage elastic-search clusters deployed for use with elastic-harvester.

## Features

- MappingMaker : Generate elastic-search mappings from a harvester app.
- MappingManager : Get, add, delete, and update elastic-search mappings.
- Reloader : Reload an elastic-search index from a syncronized mongo-powered harvester endpoint.

## Installation

Clone the elastic-harvester repo and do npm install

## Usage

Terms & Examples:

{ES_SERVER_URL} e.g. http://localhost:9200

{HARVESTER_APP_URL} e.g. http:localhost:9000

{ES_INDEX} e.g. dealer-api

{ES_TYPE} e.g. dealers

{PATH-TO-NEW-MAPPING-JSON-FILE} e.g. ../test/test.mapping.js

{PATH-TO-HARVESTER-APP} e.g. ./app | Note: this app will be imported and it's expected to return promise that resolved to a harvesterApp.

{ES-GRAPH-POV} e.g. people | Note: This determines which resource the mapping will start from.

{FILE-TO-CREATE.mapping.json} e.g. generated.mapping.json

#### MappingMaker

_Generate scaffolded elastic-search mapping from a harvester app._

 Meant to be run @cmd line, but can also be required and used in code.

 - GENERATE
 Usage: node mappingMaker.js {PATH-TO-HARVESTER-APP} {ES-GRAPH-POV} {FILE-TO-CREATE.mapping.json}

 NB: {FILE-TO-CREATE.mapping.json} is optional. If not specified, no file will be written to disk; instead the mapping will be console.logged.



#### MappingManager
_Elastic-Search mapping helper_

Get, add, delete, and update elastic-search mappings.
Meant to be run @cmd line, but can also be required and used in code.


- ADD
Usage: node mappingManager.js add {ES_SERVER_URL} {ES_INDEX} {ES_TYPE} {PATH-TO-NEW-MAPPING-JSON-FILE}
- GET
Usage: node mappingManager.js get {ES_SERVER_URL} {ES_INDEX}
- UPDATE (destructive, *causes data loss to entire index*)
Usage: node mappingManager.js update {ES_SERVER_URL} {ES_INDEX} {ES_TYPE} {PATH-TO-NEW-MAPPING-JSON-FILE}
- DELETE (destructive)
Usage: node mappingManager.js delete {ES_SERVER_URL} {ES_INDEX}

#### Reloader

_Elastic-Search index reloader_

Reload elastic-search index from a syncronized mongo-powered harvester endpoint.
Meant to be run @cmd line, but can also be required and used in code.

- RELOAD
Usage: node reloader.js {HARVESTER_APP_URL} {ES_TYPE}

NB: {ES_TYPE} is optional. If not specified, defaults to the part of the url after the last "/".


## Roadmap
