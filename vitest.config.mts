import { defineConfig } from "vitest/config";

const overall = { lines: 80, statements: 80, functions: 80, branches: 80 };
const critical = { lines: 90, statements: 90, functions: 90, branches: 90 };

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        ...overall,
        "src/domain/**/*.{ts,tsx}": critical,
        "src/lib/security/**/*.{ts,tsx}": critical,
      },
    },
  },
});
