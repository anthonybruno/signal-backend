import nodeConfig from 'abruno-dev-config/eslint/node';

export default [
  ...nodeConfig,
  {
    rules: {
      'import/no-unresolved': 'off',
      'import/extensions': 'off',
      'no-process-env': 'off',
    },
  },
];
