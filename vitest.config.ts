import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "node", environment: "node", include: ["test/**/*.test.ts"] },
      },
      {
        resolve: { alias },
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["test/**/*.test.tsx"],
          setupFiles: ["test/setup-jsdom.ts"],
        },
      },
    ],
  },
});
