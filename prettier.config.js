import baseConfig from 'abruno-dev-config/prettier';

const { plugins, tailwindFunctions, ...restConfig } = baseConfig;

export default {
  ...restConfig,
  plugins: [],
};
