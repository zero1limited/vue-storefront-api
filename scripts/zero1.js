const program = require('commander')
const config = require('config')
const spawn = require('child_process').spawn

function multiStoreConfig(apiConfig, storeCode) {
  let confCopy = Object.assign({}, apiConfig)

  if (storeCode && config.availableStores.indexOf(storeCode) >= 0)
  {
      if (config.magento2['api_' + storeCode]) {
          confCopy = Object.assign({}, config.magento2['api_' + storeCode]) // we're to use the specific api configuration - maybe even separate magento instance
      }
      confCopy.url = confCopy.url + '/' + storeCode
  } else {
      if (storeCode) {
          console.error('Unavailable store code', storeCode)
      }
  }
  return confCopy
}

function getMagentoDefaultConfig(storeCode) {
  const apiConfig = multiStoreConfig(config.magento2.api, storeCode)
  return {
    TIME_TO_EXIT: 2000,
    PRODUCTS_SPECIAL_PRICES: false,
    SKIP_REVIEWS: false,
    SKIP_CATEGORIES: false,
    SKIP_PRODUCTCATEGORIES: false,
    SKIP_ATTRIBUTES: false,
    SKIP_TAXRULE: false,
    SKIP_PRODUCTS: false,
    PRODUCTS_EXCLUDE_DISABLED: config.catalog.excludeDisabledProducts,
    MAGENTO_CONSUMER_KEY: apiConfig.consumerKey,
    MAGENTO_CONSUMER_SECRET: apiConfig.consumerSecret,
    MAGENTO_ACCESS_TOKEN: apiConfig.accessToken,
    MAGENTO_ACCESS_TOKEN_SECRET: apiConfig.accessTokenSecret,
    MAGENTO_URL: apiConfig.url,
    REDIS_HOST: config.redis.host,
    REDIS_PORT: config.redis.port,
    REDIS_DB: config.redis.db,
    INDEX_NAME: config.elasticsearch.indices[0],
    DATABASE_URL: `${config.elasticsearch.protocol}://${config.elasticsearch.host}:${config.elasticsearch.port}`
  }
}

function exec(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    let child = spawn(cmd, args, opts)
    child.stdout.on('data', (data) => {
      console.log(data.toString('utf8'));
    });

    child.stderr.on('data', (data) => {
      console.log(data.toString('utf8'));
    });

    child.on('close', (code) => {
      resolve(code)
    });

    child.on('error', (error) => {
      console.error(error)
      reject(error)
    });
  })
}

program
    .command('import-products')
    .option('--store-code <storeCode>', 'storeCode in multistore setup', null)
    .action((cmd) => {
        let magentoConfig = getMagentoDefaultConfig(cmd.storeCode)

        if (cmd.storeCode) {
            const storeView = config.storeViews[cmd.storeCode]
            if (!storeView) {
                console.error('Wrong storeCode provided - no such store in the config.storeViews[storeCode]', cmd.storeCode)
                process.exit(-1)
            } else {
                magentoConfig.INDEX_NAME = storeView.elasticsearch.index;
                magentoConfig.MAGENTO_STORE_ID = storeView.storeId;
            }
        }

        const env = Object.assign({}, magentoConfig, process.env)  // use process env as well

        let importProductsPromise = function() {
            console.log(' == PRODUCTS IMPORTER ==');
            return exec('node', [
                '--harmony',
                'node_modules/mage2vuestorefront/src/cli.js',
                'products',
                '--removeNonExistent=true',
                '--partitions=1',
                '--partitionSize=300'
            ], { env: env, shell: true })
        }

        let reindexPromise = function() {
            console.log(' == REINDEXING DATABASE ==')
            return exec('node', [
                'scripts/db.js',
                'rebuild',
                `--indexName=${env.INDEX_NAME}`
            ], {env: env, shell: true})
        }

        importProductsPromise().then (() => {
            reindexPromise().then( () => {
                console.log('Done! Bye Bye!')
                process.exit(0)
            })
        })
    });

program
    .command('import-categories')
    .option('--store-code <storeCode>', 'storeCode in multistore setup', null)
    .action((cmd) => {
    let magentoConfig = getMagentoDefaultConfig(cmd.storeCode)

    if (cmd.storeCode) {
        const storeView = config.storeViews[cmd.storeCode]
        if (!storeView) {
            console.error('Wrong storeCode provided - no such store in the config.storeViews[storeCode]', cmd.storeCode)
            process.exit(-1)
        } else {
            magentoConfig.INDEX_NAME = storeView.elasticsearch.index;
            magentoConfig.MAGENTO_STORE_ID = storeView.storeId;
        }
    }

    const env = Object.assign({}, magentoConfig, process.env)  // use process env as well
    env['SEO_USE_URL_DISPATCHER'] = false

    let importCategoriesPromise = function() {
        console.log(' == CATEGORIES IMPORTER ==');
        return exec('node', [
            '--harmony',
            'node_modules/mage2vuestorefront/src/cli.js',
            'categories',
            '--removeNonExistent=true',
            '--extendedCategories=true',
            '--generateUniqueUrlKeys=false'
        ], { env: env, shell: true })
    }

    let reindexPromise = function() {
        console.log(' == REINDEXING DATABASE ==')
        return exec('node', [
            'scripts/db.js',
            'rebuild',
            `--indexName=${env.INDEX_NAME}`
        ], {env: env, shell: true})
    }

    importCategoriesPromise().then (() => {
            //reindexPromise().then( () => {
                console.log('Done! Bye Bye!')
                process.exit(0)
            //})
        })
});

program
  .command('import-attributes')
  .action((cmd) => {
    let magentoConfig = getMagentoDefaultConfig(cmd.storeCode)
    const env = Object.assign({}, magentoConfig, process.env)  // use process env as well

    console.log(' == ATTRIBUTES IMPORTER ==');
    return exec('node', [
      '--harmony',
      'node_modules/mage2vuestorefront/src/cli.js',
      'attributes',
      '--removeNonExistent=true'
    ], { env: env, shell: true })
  });

program
  .on('command:*', () => {
    console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
    process.exit(1);
  });

program
  .parse(process.argv)

process.on('unhandledRejection', (reason, p) => {
  console.log("Unhandled Rejection at: Promise ", p, " reason: ", reason)
})

process.on('uncaughtException', function(exception) {
  console.log(exception)
})
