import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            "max-len": ["error", { "code": 120 }],
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-var-requires": "off"
        }
    }
);
