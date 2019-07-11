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

        let esSkus = [];
        selectedUniverse['items-section'].items.item.forEach(function(item) {
            item.attribute.forEach(function(attribute) {
                if(attribute.name === 'p_sku') {
                    esSkus.push(attribute.value[0].value);
                }
            });
        });

        return esSkus;
    }
}

module.exports = FredhopperProductProcessor
