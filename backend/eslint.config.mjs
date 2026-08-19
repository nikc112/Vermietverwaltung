// ESLint Flat Config fuer das Backend (Fastify + TypeScript)
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'prisma/**'],
  },
  ...tseslint.configs.recommended,
);
