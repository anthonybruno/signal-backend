import nodeConfig from 'abruno-dev-config/eslint/node';

export default [
  ...nodeConfig,
  {
    rules: {
      'max-lines-per-function': 'off',
      'import/no-unresolved': 'off',
      'import/extensions': 'off',
      'no-process-env': 'off',
    },
  },
];
