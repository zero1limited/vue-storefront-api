import PlatformFactory from '../platform/factory'
const jwa = require('jwa');
const hmac = jwa('HS256');
import { sgnSrc } from '../lib/util'
import request from "request";
import ProcessorFactory from "./factory";

class FredhopperProductProcessor {
    constructor(config){
        this._config = config
    }

    getSkuList (_resBody) {
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

        response.esSkus = [];
        selectedUniverse['items-section'].items.item.forEach(function(item) {
            item.attribute.forEach(function(attribute) {
                if(attribute.name === 'p_sku') {
                    response.esSkus.push(attribute.value[0].value);
                }
            });
        });

        // aggregations
        response.aggregations = {};
        selectedUniverse['facetmap'][0].filter.forEach(function(filter) {
            let hidden = false;
            filter['custom-fields']['custom-field'].forEach(function(field) {
                if(field.name === 'Style') {
                    if(field.value === 'Hidden') {
                        hidden = true;
                    }
                }
            });

            if(hidden === false) {
                response.aggregations['agg_terms_' + filter.on] = {
                    doc_count_error_upper_bound: null,
                    sum_other_doc_count: null,
                    buckets: []
                };

                response.aggregations['agg_terms_' + filter.on + '_options'] = {
                    doc_count_error_upper_bound: null,
                    sum_other_doc_count: null,
                    buckets: []
                };

                filter.filtersection.forEach(function (value) {
                    response.aggregations['agg_terms_' + filter.on + '_options'].buckets.push({
                        key: value.value.value,
                        label: value.link.name,
                        doc_count: value.nr
                    });
                });
            }
        });

        return response;
    }
}

module.exports = FredhopperProductProcessor
