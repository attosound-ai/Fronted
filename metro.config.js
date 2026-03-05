const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow bundling .html files as assets (for WebView splash animation)
config.resolver.assetExts.push('html');

module.exports = config;
