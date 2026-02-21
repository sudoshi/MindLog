module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required for WatermelonDB decorators (@field, @text, @date, etc.)
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      // Required for WatermelonDB (must come after decorators)
      ['@babel/plugin-proposal-class-properties', { loose: true }],
      // Required for react-native-reanimated (must be last)
      'react-native-reanimated/plugin',
    ],
  };
};
