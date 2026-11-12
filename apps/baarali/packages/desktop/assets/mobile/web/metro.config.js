// BAARALI(08/11/2026): Baarali in the browser (web-shims/): modules that only
// exist on the phone get a browser stand-in on the web, nowhere else.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const shim = (file) => path.join(__dirname, 'web-shims', file);
const WEB = {
  'expo-secure-store': shim('secure-store.js'),
  // The iPhone symbols drawn with Lucide (web-shims/expo-image.js), which the desktop app already ships.
  'expo-image': shim('expo-image.js'),
  'lucide-react': require.resolve('lucide-react', { paths: [path.join(__dirname, '../renderer')] }),
};
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  // The stand-in itself reaches the real module through its own path (expo-image/src/index).
  if (platform === 'web' && WEB[name] && context.originModulePath !== WEB[name]) return { type: 'sourceFile', filePath: WEB[name] };
  return resolve ? resolve(context, name, platform) : context.resolveRequest(context, name, platform);
};
module.exports = config;
