import { Logger } from '@hydrooj/utils';
import cac from 'cac';
import fs from 'fs-extra';
import path from 'path';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';

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

function postCssLoader() {
  return {
    loader: 'postcss-loader',
    options: {
      postcssOptions: {
        plugins: {
          'postcss-preset-mantine': {},
          'postcss-simple-vars': {
            variables: {
              'mantine-breakpoint-xs': '36em',
              'mantine-breakpoint-sm': '48em',
              'mantine-breakpoint-md': '62em',
              'mantine-breakpoint-lg': '75em',
              'mantine-breakpoint-xl': '88em',
            },
          },
        },
      },
    },
  };
}

const argv = cac().parse();
const { dev = false, watch = false, production = false } = argv.options;

const compiler = webpack({
  mode: production ? 'production' : 'development',
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
        type: 'javascript/auto',
        use: [esbuildLoader()],
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          cssLoader(),
          postCssLoader(),
        ],
      },
    ],
  },
  plugins: [
    new webpack.ProgressPlugin(),
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
  if (dev) {
    const server = new WebpackDevServer({
      port: 8080,
      compress: true,
      hot: true,
      server: 'http',
      allowedHosts: 'all',
      proxy: [{
        context: (p) => p !== '/ws',
        target: process.env.TOOLS_API || 'http://localhost:5283',
      }],
      client: {
        webSocketURL: 'auto://0.0.0.0:0/ws',
      },
    }, compiler);
    server.start();
    return;
  }
  function compilerCallback(err, stats: webpack.Stats) {
    if (err) {
      logger.error(err.stack || err);
      if (err.details) logger.error(err.details);
      if (!watch && (!stats || stats.hasErrors())) process.exit(1);
    }
    if (argv.options.detail) logger.info(stats.toString());
    if (!watch && (!stats || stats.hasErrors())) process.exit(1);
    fs.ensureDirSync(path.resolve(__dirname, '../server/data/'));
    fs.copyFileSync(path.resolve(__dirname, 'dist/main.js'), path.resolve(__dirname, '../server/data/static.frontend'));
    logger.info('Build finished, bundle size:', ((stats?.toJson().assets?.[0]?.size || 0) / 1024 / 1024).toFixed(2), 'MB');
  }
  if (watch) compiler.watch({}, compilerCallback);
  else compiler.run(compilerCallback);
})();
