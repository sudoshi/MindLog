/**
 * Expo config plugin: resolve WatermelonDB's `simdjson` dependency from the
 * npm-vendored @nozbe/simdjson package instead of the CocoaPods CDN.
 *
 * WatermelonDB's own podspec comment says:
 *   "NPM-vendored @nozbe/simdjson must be used, not the CocoaPods version"
 *
 * Without this plugin, EAS builds fail with:
 *   "Unable to find a specification for `simdjson` depended upon by `WatermelonDB`"
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withSimdjson(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile',
      );
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      const injection = `  pod 'simdjson', :path => '../node_modules/@nozbe/simdjson'`;

      if (!podfile.includes("pod 'simdjson'")) {
        // Insert right before the first `use_react_native!` call so it is
        // declared before WatermelonDB's transitive dependency is resolved.
        podfile = podfile.replace(
          /^(\s*use_react_native!)/m,
          `${injection}\n\n$1`,
        );
        fs.writeFileSync(podfilePath, podfile);
      }

      return config;
    },
  ]);
};
