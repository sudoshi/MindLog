// =============================================================================
// MindLog Mobile — Metro bundler configuration
// Configures Metro for npm workspaces monorepo so packages under /packages/*
// (e.g. @mindlog/shared) are watched and resolved correctly.
// =============================================================================

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Allow Metro to watch and serve files from the whole monorepo.
// Without this, Metro refuses to serve any file outside `apps/mobile/`.
config.watchFolders = [monorepoRoot];

// Tell the resolver to look for packages in both the app-level and
// monorepo-level node_modules, in that priority order.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Exclude WatermelonDB's Node.js SQLite adapter — it requires native Node modules
// (better-sqlite3, fs) that don't exist in a React Native / web bundle context.
// The Android/iOS native adapters are used instead.
config.resolver.blockList = [
  /node_modules\/@nozbe\/watermelondb\/adapters\/sqlite\/sqlite-node\/.*/,
];

// When a `.js` relative import can't be resolved (common with TypeScript
// source files that use ESM-style `.js` extensions), fall back to `.ts`.
// This handles Metro following source maps from compiled dist/ back to src/.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    (moduleName.startsWith('./') || moduleName.startsWith('../')) &&
    moduleName.endsWith('.js')
  ) {
    const originDir = path.dirname(context.originModulePath);
    const absJsPath = path.resolve(originDir, moduleName);

    // If the .js file doesn't exist, try the .ts / .tsx counterpart
    if (!fs.existsSync(absJsPath)) {
      for (const ext of ['.ts', '.tsx']) {
        const tsCandidate = absJsPath.slice(0, -3) + ext;
        if (fs.existsSync(tsCandidate)) {
          return { type: 'sourceFile', filePath: tsCandidate };
        }
      }
    }
  }

  // Default Metro resolution for everything else
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
