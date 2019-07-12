import jwt from 'jwt-simple';
import request from 'request';
import ProcessorFactory from '../processor/factory';
import _get from 'lodash/get';

function _updateQueryStringParameter(uri, key, value) {
	var re = new RegExp("([?&])" + key + "=.*?(&|#|$)", "i");
	if (uri.match(re)) {
		if (value) {
			return uri.replace(re, '$1' + key + "=" + value + '$2');
		} else {
			return uri.replace(re, '$1' + '$2');
		}
	} else {
		var hash =  '';
		if( uri.indexOf('#') !== -1 ){
			hash = uri.replace(/.*#/, '#');
			uri = uri.replace(/#.*/, '');
		}
		var separator = uri.indexOf('?') !== -1 ? "&" : "?";
		return uri + separator + key + "=" + value + hash;
	}
}

export default ({config, db}) => function (req, res, body) {
	let groupId = null

	// Request method handling: exit if not GET or POST
	// Other metods - like PUT, DELETE etc. should be available only for authorized users or not available at all)
	if (!(req.method == 'GET' || req.method == 'POST' || req.method == 'OPTIONS')) {
		throw new Error('ERROR: ' + req.method + ' request method is not supported.')
	}

	let requestBody = {}
	if (req.method === 'GET') {
		if (req.query.request) { // this is in fact optional
			requestBody = JSON.parse(decodeURIComponent(req.query.request))
			console.log(requestBody)
		}
	} else {
		requestBody = req.body
	}

	const urlSegments = req.url.split('/');

	let indexName = ''
	let entityType = ''
	if (urlSegments.length < 2)
		throw new Error('No index name given in the URL. Please do use following URL format: /api/catalog/<index_name>/<entity_type>_search')
	else {
		indexName = urlSegments[1];

		if (urlSegments.length > 2)
			entityType = urlSegments[2]

		if (config.elasticsearch.indices.indexOf(indexName) < 0) {
			throw new Error('Invalid / inaccessible index name given in the URL. Please do use following URL format: /api/catalog/<index_name>/_search')
		}

		if (urlSegments[urlSegments.length - 1].indexOf('_search') !== 0) {
			throw new Error('Please do use following URL format: /api/catalog/<index_name>/_search')
		}
	}

	// pass the request to elasticsearch
	let url = config.elasticsearch.host + ':' + config.elasticsearch.port + (req.query.request ? _updateQueryStringParameter(req.url, 'request', null) : req.url)

	if (!url.startsWith('http')) {
		url = 'http://' + url
	}

	// Check price tiers
	if (config.usePriceTiers) {
		const userToken = requestBody.groupToken

		// Decode token and get group id
		if (userToken && userToken.length > 10) {
			// if (userToken && userToken.length > 10) {
			const decodeToken = jwt.decode(userToken, config.authHashSecret ? config.authHashSecret : config.objHashSecret)
			groupId = decodeToken.group_id || groupId
		}

		delete requestBody.groupToken
	}

	let auth = null;

	// Only pass auth if configured
	if (config.elasticsearch.user || config.elasticsearch.password) {
		auth = {
			user: config.elasticsearch.user,
			pass: config.elasticsearch.password
		};
	}

	// Default search adapter is ES.
	let searchAdapter = 'elasticsearch';

	// categoryId of viewed category (only is user is viewing a PLP)
	let categoryId = null;

	// fredhopper_category_id value from Magento / ES.
	let fredhopperCategoryId = null;

	// Array of facets, these are gather from Fredhopper.
	let facetFilters = [];

	try {
		if(entityType === 'product') {
			if (req.query.request) {
				requestBody = JSON.parse(decodeURIComponent(req.query.request));
				if(requestBody.query.bool.filter.bool) {
					// Find the category ID from the API request.
					let mustTerms = requestBody.query.bool.filter.bool.must;
					mustTerms.forEach(function (term) {
						if (term.terms.category_ids) {
							categoryId = term.terms.category_ids[0];
						}
					});

					// Facets - this could do with going over, making more solid.
					// Get selected Facets from the API request.
					//
					try {
						let shouldTerms = requestBody.query.bool.filter.bool.should[0];

						// Multiple filters are applied.
						if(shouldTerms.bool.must) {
							shouldTerms = requestBody.query.bool.filter.bool.should[0].bool.must;

							shouldTerms.forEach(function (term) {
								facetFilters.push({
									key: Object.keys(term.terms)[0],
									value: term.terms[Object.keys(term.terms)[0]][0]
								});
							});
						}

						// Only one filter is applied.
						if(shouldTerms.bool.filter) {
							shouldTerms = requestBody.query.bool.filter.bool.should[0].bool.filter;

							facetFilters.push({
								key: Object.keys(shouldTerms.terms)[0],
								value: shouldTerms.terms[Object.keys(shouldTerms.terms)[0]][0]
							});
						}
					} catch (error) {
						console.log('No facets selected.');
					}

					// If categoryId has been found, we can use Fredhopper.
					if(categoryId !== null) {
						searchAdapter = 'fredhopper';
					}
				}
			}
		}

		// If API request is for attributes, always use Fredhopper.
		if(entityType === 'attribute') {
			searchAdapter = 'fredhopper';
			categoryId = 1;
		}
	} catch (error) {
		searchAdapter = 'elasticsearch';
	}

	// searchAdapter = 'elasticsearch';

	if(searchAdapter === 'fredhopper' && categoryId !== null) {
		console.log('Search adapter has been determined as Fredhopper');

		if(entityType === 'product') {
			console.log('Fredhopper call for product listing (category_id: %s)', categoryId);
			console.log('Selected facets:');
			console.debug(facetFilters);

			const factory = new ProcessorFactory(config);

			// Get the fredhopper category ID from ElasticSearch
			let getFreddhopperId = function(categoryId) {
				console.debug('->getFreddhopperId(%s)', categoryId);
				return new Promise((resolve, reject) => {

					if (categoryId === 0){
						resolve('allproductsdare2b')
					}

					let customUrl = config.elasticsearch.host + ':' + config.elasticsearch.port;
					if (!customUrl.startsWith('http')) {
						customUrl = 'http://' + customUrl;
					}

					customUrl = customUrl + '/vue_storefront_catalog_db_fr/category/_search?' + 'size=50&from=0&_source=fredhopper_category_id';
					let customRequest = JSON.parse('{ "query": { "bool": { "filter": { "bool": { "must": [ { "terms": { "id": [ "' + categoryId + '" ] } } ] } } } } }');

					console.log('Starting initial Elasticsearch request for fredhopperCategoryId');
					request({ // do the elasticsearch request
						uri: customUrl,
						method: 'GET',
						body: customRequest,
						json: true,
						auth: auth,
					}, function (_err, _res, _resBody) {

						if (_resBody && _resBody.hits && _resBody.hits.hits) {
							fredhopperCategoryId = _get(_resBody, 'hits.hits[0]._source.fredhopper_category_id', null);
							console.log('A Fredhopper category ID has been found: ' + fredhopperCategoryId);
							if (fredhopperCategoryId === null) {
								reject('Unable to find Fredhopper Category Id in ElasticSearch, from category ID: ' + categoryId);
							}
							resolve(fredhopperCategoryId);
						} else {
							reject('Issue while querying ElasticSearch for Fredhopper Category Id, from category ID: ' + categoryId);
						}
					});
				});
			};

			let getFredhopperProductSkus = function(fredhopperCategoryId) {
				console.debug('->getFredhopperProductSkus(%s)', fredhopperCategoryId);
				return new Promise((resolve, reject) => {

					let furl = config.fredhopperfas.protocol + config.fredhopperfas.host + '/fredhopper/query?fh_location=//dare2b/fr_FR/categories%3C%7Bdare2b_' + fredhopperCategoryId + '%7D';

					// http://query.published.live1.fas.eu1.fredhopperservices.com/fredhopper/query?fh_location=//dare2b/fr_FR/categories%3C%7Bdare2b_mensdare2b%7D/size%3E%7Bxl%7D&fh_view_size=48
					furl = furl + '/'+'promotional_category_fr_fr'+'%3E%7B'+'zero1_pwa'+'%7D';

					// Add selected filters to our Fredhopper request.
					facetFilters.forEach(function(value) {
						furl = furl + '/'+value.key+'%3E%7B'+value.value+'%7D';
					});

					furl = furl + '&fh_view_size=48';

					let fauth = {
						user: config.fredhopperfas.user,
						pass: config.fredhopperfas.password
					};

					console.log('Calling Fredhopper');
					console.log('URL: ' + furl);

					request({ // do the Fredhopper request
						uri: furl,
						method: 'GET',
						// body: '',
						json: true,
						auth: fauth,
					}, function (_err, _res, _resBody) {
						// res.json(_resBody);
						// return;

						if (_resBody && _resBody.info) {
							let fredhopperProcessor = factory.getAdapter('fredhopperProduct', indexName, req, res);
							if (fredhopperProcessor) {
								resolve(fredhopperProcessor.getSkuList(_resBody));
							}else{
								console.log('Unable to get FredhopperProcessor!');
								reject('Unable to get FredhopperProcessor!');
							}
						} else {
							console.error('Fredhopper call has failed?');
							console.dir(_resBody);
							reject('Fredhopper call has failed?')
						}
					});
				});
			};

			let loadFredhopperElasticCombined = function(fredhopperProducts) {
				console.debug('->loadFredhopperElasticCombined(%s)', fredhopperProducts);
				return new Promise((resolve, reject) => {

					// Build elasticsearch request
					let requestBody = {
						query: {
							bool: {
								must: {
									terms: {
										sku: fredhopperProducts.esSkus
									}
								}
							}
						}
					};


					let url = config.elasticsearch.host + ':' + config.elasticsearch.port + '/vue_storefront_catalog_db_fr/product/_search';

					if (!url.startsWith('http')) {
						url = 'http://' + url;
					}

					let auth = null;

					// Only pass auth if configured
					if (config.elasticsearch.user || config.elasticsearch.password) {
						auth = {
							user: config.elasticsearch.user,
							pass: config.elasticsearch.password
						};
					}

					request({ // do the elasticsearch request
						uri: url,
						method: 'GET',
						body: requestBody,
						json: true,
						auth: auth
					}, function (_err, _res, _resBody) { // TODO: add caching layer to speed up SSR? How to invalidate products (checksum on the response BEFORE processing it)
						if (_resBody && _resBody.hits && _resBody.hits.hits) { // we're signing up all objects returned to the client to be able to validate them when (for example order)

							// Quick hack because for some reason no products have url_paths
							_resBody.hits.hits.forEach(function(product) {
								if(!product._source.url_path && product._source.url_key) {
									product._source.url_path = product._source.url_key+'/';
								}
							});

							let orderedHits = [];

							fredhopperProducts.esSkus.forEach(function(sku) {
								_resBody.hits.hits.forEach(function(product) {
									if(product._source.sku === sku) {
										orderedHits.push(product);
									}
								});
							});

							_resBody.hits.hits = orderedHits;

							_resBody.aggregations = fredhopperProducts.aggregations;

							resolve(_resBody);
						} else {
							console.error('Elasticsearch call has failed?');
							console.dir(_resBody);
							reject('Elasticsearch call has failed?');
						}
					});
				});
			};

			// =============================================================
			// 							This is where the magic happens
			// =============================================================
			getFreddhopperId(categoryId).then((fredhopperCategoryId) => {
				console.debug('determined fredhopperCategoryId: %s', fredhopperCategoryId);
				getFredhopperProductSkus(fredhopperCategoryId).then((fredhopperProducts) => {
					console.log('fredhopper product SKUs');
					console.dir(fredhopperProducts);

					loadFredhopperElasticCombined(fredhopperProducts).then((response) => {
						console.log('response from custom elasticsearch call:');
						console.log(response);

						let productProcessor = factory.getAdapter('product', indexName, req, res);
						productProcessor.process(response.hits.hits, groupId).then((result) => {
							response.hits.hits = result;
							res.json(response);
						}).catch((err) => {
							console.error(err);
						});
					})
				})
			});
		}

		if(entityType === 'attribute') {
			console.log('Fredhopper call for attribute');
			let furl = config.fredhopperfas.protocol + config.fredhopperfas.host + '/fredhopper/query?fh_location=//dare2b/fr_FR';

			let fauth = {
				user: config.fredhopperfas.user,
				pass: config.fredhopperfas.password
			};

			console.log('Calling Fredhopper');
			console.log('URL: ' + furl);

			request({ // do the Fredhopper request
				uri: furl,
				method: 'GET',
				// body: '',
				json: true,
				auth: fauth,
			}, function (_err, _res, _resBody) {
				if (_resBody && _resBody.info) {

					// res.json(_resBody);
					// return;

					const factory = new ProcessorFactory(config);
					let fredhopperProcessor = factory.getAdapter('fredhopperAttribute', indexName, req, res);

					if (fredhopperProcessor) {
						_resBody = fredhopperProcessor.convertToElastic(_resBody);
						res.json(_resBody);
					}
					console.log('Fredhopper call DONE.');
				} else {
					console.error('Fredhopper call has failed.');
					res.json(_resBody);
				}
			});
		}
	} else {
		console.log('Search adapter has been determined as Elasticsearch');
		request({ // do the elasticsearch request
			uri: url,
			method: req.method,
			body: requestBody,
			json: true,
			auth: auth,
		}, function (_err, _res, _resBody) { // TODO: add caching layer to speed up SSR? How to invalidate products (checksum on the response BEFORE processing it)
			if (_resBody && _resBody.hits && _resBody.hits.hits) { // we're signing up all objects returned to the client to be able to validate them when (for example order)

				const factory = new ProcessorFactory(config)
				let resultProcessor = factory.getAdapter(entityType, indexName, req, res)

				if (!resultProcessor)
					resultProcessor = factory.getAdapter('default', indexName, req, res) // get the default processor

				if (entityType === 'product') {
					resultProcessor.process(_resBody.hits.hits, groupId).then((result) => {
						_resBody.hits.hits = result
						res.json(_resBody);
					}).catch((err) => {
						console.error(err)
					})
				} else {
					resultProcessor.process(_resBody.hits.hits).then((result) => {
						_resBody.hits.hits = result
						res.json(_resBody);
					}).catch((err) => {
						console.error(err)
					})
				}

			} else {
				res.json(_resBody);
			}
		});
	}
}
