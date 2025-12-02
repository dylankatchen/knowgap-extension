// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'development';
process.env.NODE_ENV = 'development';
process.env.ASSET_PATH = '/';

var WebpackDevServer = require('webpack-dev-server'),
  webpack = require('webpack'),
  config = require('../webpack.config'),
  env = require('./env'),
  path = require('path');

var options = config.chromeExtensionBoilerplate || {};
var excludeEntriesToHotReload = options.notHotReload || [];

for (var entryName in config.entry) {
  if (
    excludeEntriesToHotReload.indexOf(entryName) === -1 &&
    entryName !== 'contentScript' &&
    entryName !== 'background' &&
    entryName !== 'devtools'
  ) {
    config.entry[entryName] = [
      'webpack/hot/dev-server',
      `webpack-dev-server/client/index.js?protocol=wss&hostname=localhost&port=${env.PORT}&pathname=/ws&hot=true&live-reload=false`,
    ].concat(config.entry[entryName]);
  }
}

delete config.chromeExtensionBoilerplate;

var compiler = webpack(config);

var server = new WebpackDevServer(
  {
    server: {
      type: 'https',
    },
    hot: true,
    liveReload: false,
    client: {
      webSocketURL: {
        protocol: 'wss',
        hostname: 'localhost',
        port: env.PORT,
        pathname: '/ws',
      },
    },
    host: 'localhost',
    port: env.PORT,
    static: {
      directory: path.join(__dirname, '../build'),
    },
    devMiddleware: {
      publicPath: `https://localhost:${env.PORT}/`,
      writeToDisk: true,
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    allowedHosts: 'all',
  },
  compiler
);

(async () => {
  await server.start();
})();
