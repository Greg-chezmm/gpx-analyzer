import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Règle orientée React Compiler ajoutée au preset "recommended" v7 : flague aussi
      // les patterns classiques légitimes (reset d'état au changement de prop, fetch-on-mount) —
      // beaucoup de faux positifs ici, downgradé pour ne pas bloquer `npm run lint` sur du style.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
