import baseConfig from 'abruno-dev-config/commitlint.config';

export default {
  ...baseConfig,
  rules: {
    'header-max-length': [2, 'always', 200],
  },
};
