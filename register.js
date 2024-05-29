const fs = require('fs-extra');
require('@hydrooj/register');

function fileLoader(module, filename) {
    const content = fs.readFileSync(filename);
    return module._compile(`module.exports=${JSON.stringify(content.toString('base64'))}`, filename);
}
require.extensions['.ttf'] = fileLoader;
require.extensions['.wasm'] = fileLoader;
require.extensions['.frontend'] = fileLoader;
