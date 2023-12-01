if (process.argv.includes('--client')) {
    require('./packages/client/index');
} else {
    require('./packages/server/index');
}
