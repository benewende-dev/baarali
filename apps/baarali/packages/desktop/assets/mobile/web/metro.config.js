// BAARALI(08/11/2026): Baarali in the browser (web-shims/): modules that only
// exist on the phone get a browser stand-in on the web, nowhere else.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const WEB = { 'expo-secure-store': path.join(__dirname, 'web-shims/secure-store.js') };
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  if (platform === 'web' && WEB[name]) return { type: 'sourceFile', filePath: WEB[name] };
  return resolve ? resolve(context, name, platform) : context.resolveRequest(context, name, platform);
};
module.exports = config;
