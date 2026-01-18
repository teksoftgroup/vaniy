import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "jsdom",
  },
  build: {
    lib: {
      entry: "src/index.js",
      name: "vaniy",
      formats: ["es", "umd"],
      fileName: (format) => (format === "es" ? "vaniy.es.js" : "vaniy.umd.js"),
    },
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      output: {
        exports: "named",
      },
    },
  },
});
