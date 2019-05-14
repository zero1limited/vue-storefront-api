import PlatformFactory from '../platform/factory'
const jwa = require('jwa');
const hmac = jwa('HS256');
import { sgnSrc } from '../lib/util'

class FredhopperAttributeProcessor {
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
            total: selectedUniverse['facetmap'][0].filter.length,
            max_score: null
        };

        // hits.hits
        response.hits.hits = [];
        // return response;
        //dwdw

        let count = 0;
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
                count = count + 1;

                let hit = {
                    _index: 'vue_storefront_catalog_db_fr',
                    _type: 'attribute',
                    _id: count,
                    _score: null,
                    _source: {
                        id: count,
                        options: [],
                        is_wysiwyg_enabled: false,
                        is_html_allowed_on_front: false,
                        used_for_sort_by: false,
                        is_filterable: true,
                        is_filterable_in_search: false,
                        is_used_in_grid: true,
                        is_visible_in_grid: false,
                        is_filterable_in_grid: true,
                        position: 0,
                        apply_to: [
                            "simple",
                            "virtual",
                            "configurable"
                        ],
                        is_searchable: "1",
                        is_visible_in_advanced_search: "1",
                        is_comparable: "1",
                        is_used_for_promo_rules: "0",
                        is_visible_on_front: "1",
                        used_in_product_listing: "1",
                        is_visible: true,
                        attribute_id: count,
                        attribute_code: filter.on,
                        frontend_input: "select",
                        entity_type_id: "4",
                        is_required: false,
                        is_user_defined: true,
                        default_frontend_label: filter.title,
                        frontend_label: filter.title,
                        backend_type: "",
                        source_model: null,
                        default_value: "",
                        is_unique: "0",
                        validation_rules: [],
                        tsk: null
                    }
                };

                filter.filtersection.forEach(function (value) {
                    hit._source.options.push({
                        label: value.link.name,
                        value: value.value.value
                    })
                });


                response.hits.hits.push(hit);
            }
        });

        return response;
    }
}

module.exports = FredhopperAttributeProcessor
