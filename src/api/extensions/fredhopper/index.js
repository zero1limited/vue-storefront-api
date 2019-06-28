import { apiStatus } from '../../../lib/util';
import { Router } from 'express';
import request from 'request';
import _get from "lodash/get";

module.exports = ({ config, db }) => {

    let api = Router();

    api.post('/gethero', (req, res) => {
        let body = '';

        // let fredhopperCategoryId = 'mensdare2b';
        let fredhopperCategoryId = req.body.id;

        let furl = config.fredhopperfas.protocol + config.fredhopperfas.host + '/fredhopper/query?fh_location=//dare2b/fr_FR/categories%3C%7Bdare2b_' + fredhopperCategoryId + '%7D';
        furl = furl + '&fh_view_size=48';

        let fauth = {
            user: config.fredhopperfas.user,
            pass: config.fredhopperfas.password
        };

        request({ // do the Fredhopper request
            uri: furl,
            method: 'GET',
            json: true,
            auth: fauth,
        }, function (_err, _res, _resBody) {
            if (_resBody && _resBody.info) {

                let selectedUniverse = _resBody.info['current-universe'];

                _resBody.universes.universe.forEach(function(universe) {
                    if(universe.name === selectedUniverse) {
                        selectedUniverse = universe;
                        return;
                    }
                });

                selectedUniverse.themes[0].theme.forEach(function(theme) {
                    if(theme['custom-fields']['custom-field'][0].value == 'Hero Text') {
                        theme['static-content'].content.forEach(function(content) {
                            if(content['content-value'] != null && content['type'] == 'text') {
                                apiStatus(res, content['content-value'], 200);
                            }
                        });
                    }
                });

                apiStatus(res, 'not found', 200);
            } else {
                apiStatus(res, 'Error calling Fredhopper', 500);
            }
        });
    });

    api.post('/search', (req, res) => {
        let body = '';

        let furl = 'https://query.published.live1.suggest.eu1.fredhopperservices.com/regatta/jscript';

        // Hard coded scope for now
        let scope = '?scope=//dare2b/fr_FR';
        let query = '&search=' + encodeURI(req.body.search);

        // Testing
        // let query = '&search=' + encodeURI('red jacket');

        furl = furl + scope + query;

        // https://query.published.live1.suggest.eu1.fredhopperservices.com/regatta/jscript?scope=//dare2b/fr_FR&search=this%20is%20cool
        // https://query.published.live1.suggest.eu1.fredhopperservices.com/regatta/jscript
        // ?scope=//dare2b/fr_FR
        // &search=this%20is%20cool

        request({ // do the Fredhopper request
            uri: furl,
            method: 'GET',
            json: true,
        }, function (_err, _res, _resBody) {
            if (_resBody) {

                // Remove start of Fredhopper response, for some reason it's causing issues on JSON.parse
                _resBody = _resBody.replace('updateSuggestions(', '');
                _resBody = _resBody.slice(0, -1);

                apiStatus(res, _resBody, 200);
            } else {
                apiStatus(res, 'Error calling Fredhopper', 500);
            }
        });
    });
    
    api.get('/searchtest', (req, res) => {
        let body = '';

        let furl = 'https://query.published.live1.suggest.eu1.fredhopperservices.com/regatta/jscript';

        // Hard coded scope for now
        let scope = '?scope=//dare2b/fr_FR';
        // let query = '&search=' + encodeURsI(req.body.search);

        // Testing
        let query = '&search=' + encodeURI('red');

        furl = furl + scope + query;

        // https://query.published.live1.suggest.eu1.fredhopperservices.com/regatta/jscript?scope=//dare2b/fr_FR&search=this%20is%20cool
        // https://query.published.live1.suggest.eu1.fredhopperservices.com/regatta/jscript
        // ?scope=//dare2b/fr_FR
        // &search=this%20is%20cool

        request({ // do the Fredhopper request
            uri: furl,
            method: 'GET',
            json: true,
        }, function (_err, _res, _resBody) {
            if (_resBody) {

                // Remove start of Fredhopper response, for some reason it's causing issues on JSON.parse
                _resBody = _resBody.replace('updateSuggestions(', '');
                _resBody = _resBody.slice(0, -1);

                apiStatus(res, _resBody, 200);
            } else {
                apiStatus(res, 'Error calling Fredhopper', 500);
            }
        });
    });

    return api;
};
