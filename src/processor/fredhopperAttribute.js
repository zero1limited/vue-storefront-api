import PlatformFactory from '../platform/factory'
const jwa = require('jwa');
const hmac = jwa('HS256');
import { sgnSrc } from '../lib/util'

class FredhopperProductProcessor {
    constructor(config){
        this._config = config
    }

    convertToElastic (_resBody) {
        console.debug('Entering FredhopperProcessor::convertToElastic');

        // return _resBody;

        const config = this._config;
        let response = {};

        // Get the 'selected' universe from Fredhopper response.
        let selectedUniverse = _resBody.info['current-universe'];

        _resBody.universes.universe.forEach(function(universe) {
            if(universe.name === selectedUniverse) {
                selectedUniverse = universe;
                return;
            }
        });

        response.took = 10;
        response.timed_out = false;
        response.shards = {
            total: 1,
            successful: 1,
            skipped: 0,
            failed: 0
        };

        // hits
        response.hits = {
            total: selectedUniverse['items-section'].items.item.length,
            max_score: null
        };

        // hits.hits
        response.hits.hits = [];
        selectedUniverse['items-section'].items.item.forEach(function(item) {
            let hit = {
                _index: 'vue_storefront_catalog',
                _type: 'product',
                _id: null,
                _score: null,
                _source: {
                    id: null
                }
            };
            item.attribute.forEach(function(attribute) {
                let name = getMagentoFriendlyAttribute(attribute.name);
                if(name === 'sku') {
                    hit._id = attribute.value[0].value;
                    hit._source.id = attribute.value[0].value;
                }
                hit._source[name] = attribute.value[0].value;
            });

            response.hits.hits.push(hit);
        });

        // aggregations
        response.aggregations = {};
        selectedUniverse['facetmap'][0].filter.forEach(function(filter) {
            response.aggregations['agg_terms_'+filter.on] = {
                doc_count_error_upper_bound: null,
                sum_other_doc_count: null,
                buckets: []
            };

            response.aggregations['agg_terms_'+filter.on+'_options'] = {
                doc_count_error_upper_bound: null,
                sum_other_doc_count: null,
                buckets: []
            };

            filter.filtersection.forEach(function (value) {
                response.aggregations['agg_terms_'+filter.on+'_options'].buckets.push({
                    key: value.value.value,
                    doc_count: value.nr
                });
            });
        });

        // selectedUniverse.facetmap.filter.forEach is not a function
        //  response.aggregations[("agg_terms_" + filter.title + "_options")].buckets.push i

        return response;

        function getMagentoFriendlyAttribute(name) {
            let data = config.fredhopperfas.attribute_mappings;

            if(data[name]) {
                return data[name]
            }

            return name;
            // switch(name) {
            //     case 'foo':
            //         return 'bar';
            //     case '_imageurl':
            //         return 'image';
            //     case '_thumburl':
            //         return 'thumbnail';
            //     default:
            //         return name;
            // }
        }
    }
}

module.exports = FredhopperProductProcessor
