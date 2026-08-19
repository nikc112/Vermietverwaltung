// ESLint Flat Config fuer das Frontend (React 18 + Vite + TypeScript)
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// jsx-a11y liefert seine Regeln standardmaessig als 'error'. Der Bestand hat
// dort noch Luecken, daher werden alle aktiven Regeln auf 'warn' abgestuft.
const jsxA11yWarnRules = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, config]) => {
    if (Array.isArray(config)) {
      return [rule, config[0] === 'error' ? ['warn', ...config.slice(1)] : config];
    }
    return [rule, config === 'error' ? 'warn' : config];
  }),
);

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'src/components/ui/**'],
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y.flatConfigs.recommended.plugins['jsx-a11y'],
    },
    languageOptions: {
      ...jsxA11y.flatConfigs.recommended.languageOptions,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...jsxA11yWarnRules,
    },
  },
);
