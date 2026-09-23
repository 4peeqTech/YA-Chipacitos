import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Nunca confirm()/alert() nativos — en toda la app, no solo lo migrado.
  {
    rules: {
      "no-restricted-globals": ["error",
        { name: "confirm", message: "Usá useConfirmar() de components/ui/ProveedorUI." },
        { name: "alert",   message: "Usá useToast() de components/ui/ProveedorUI." },
      ],
    },
  },
  // Hex crudo prohibido — este bloque crece a medida que se tokeniza cada
  // módulo (ver Bloque 0/F0.1 del roadmap). Hoy: components/ui, components/layout, components/manual, app/ayuda.
  {
    files: ["components/ui/**/*.tsx", "components/layout/**/*.tsx", "components/manual/**/*.tsx", "app/ayuda/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "JSXAttribute[name.name='className'] Literal[value=/-\\[#[0-9a-fA-F]{3,8}\\]/]",
        message: "Usá tokens de @theme inline (bg-surface, text-muted, …), no hex crudo.",
      }],
    },
  },
]);

export default eslintConfig;
