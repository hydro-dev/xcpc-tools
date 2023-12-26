import path from 'path';
import { Logger } from '@hydrooj/utils';
import cac from 'cac';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import WebpackBar from 'webpackbar';
import fs from 'fs-extra';

function esbuildLoader() {
  return {
    loader: 'esbuild-loader',
    options: {
      loader: 'tsx',
      target: 'es2015',
      sourcemap: true,
    },
  };
}

function cssLoader() {
  return {
    loader: 'css-loader',
    options: { importLoaders: 1 },
  };
}

const argv = cac().parse();

const compiler = webpack({
  mode: argv.options.production ? 'production' : 'development',
  entry: './app/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js',
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.cjs'],
  },
  module: {
    rules: [
      {
        test: /\.(ttf|eot|woff|woff2|png|jpg|jpeg|gif)$/,
        type: 'asset/resource',
      },
      {
        test: /\.[mc]?[jt]sx?$/,
        exclude: [/@types\//, /components\/message\//, /entry\.js/],
        type: 'javascript/auto',
        use: [esbuildLoader()],
      },
      {
        test: /\.css$/,
        use: ['style-loader', cssLoader()],
      },
    ],
  },
  plugins: [
    new WebpackBar(),
    new webpack.ProvidePlugin({
      React: 'react',
    }),
    new webpack.DefinePlugin({
      'process.env.VERSION': JSON.stringify(require('./package.json').version),
    }),
    new webpack.optimize.MinChunkSizePlugin({
      minChunkSize: 128000,
    }),
  ],
});

const logger = new Logger('build');
logger.info('Building...');

(async () => {
  const { dev = false, watch = false } = argv.options;
  if (dev) {
    const server = new WebpackDevServer({
      port: 8890,
      compress: true,
      hot: true,
      server: 'http',
      allowedHosts: 'all',
      proxy: {
        target: 'http://localhost:8889',
      },
      client: {
        webSocketURL: 'auto://0.0.0.0:0/ws',
      },
    }, compiler);
    server.start();
    return;
  }
  function compilerCallback(err, stats) {
    if (err) {
      logger.error(err.stack || err);
      if (err.details) logger.error(err.details);
      if (!watch && (!stats || stats.hasErrors())) process.exit(1);
    }
    if (argv.options.detail) logger.info(stats.toString());
    if (!watch && (!stats || stats.hasErrors())) process.exit(1);
    fs.ensureDirSync(path.resolve(__dirname, '../server/data/'));
    fs.copyFileSync(path.resolve(__dirname, 'dist/main.js'), path.resolve(__dirname, '../server/data/static.frontend'));
  }
  if (watch) compiler.watch({}, compilerCallback);
  else compiler.run(compilerCallback);
})();
