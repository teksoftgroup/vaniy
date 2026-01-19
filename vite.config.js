import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import esbuild from "rollup-plugin-esbuild";
import filesize from "rollup-plugin-filesize";

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8"),
);

const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * ${pkg.description ?? ""}
 * ${pkg.homepage ?? ""}
 * (c) ${new Date().getFullYear()} ${pkg.author ?? ""}
 * Released under the ${pkg.license ?? "MIT"} License
 */`;

const minifyPlugin = () => {
  esbuild({
    minify: true,
    target: "es2018",
  });
};

export default defineConfig({
  test: {
    environment: "jsdom",
  },

  build: {
    lib: {
      entry: "src/index.js",
      name: "vaniy",
    },

    minify: false,
    sourcemap: true,

    rollupOptions: {
      output: [
        {
          format: "es",
          entryFileNames: "vaniy.es.js",
          exports: "named",
          banner,
        },
        {
          format: "umd",
          name: "vaniy",
          entryFileNames: "vaniy.umd.js",
          exports: "named",
          banner,
        },
        {
          format: "umd",
          name: "vaniy",
          entryFileNames: "vaniy.min.js",
          exports: "named",
          banner,
          plugins: [minifyPlugin()],
        },
        {
          format: "iife",
          name: "vaniy",
          entryFileNames: "vaniy.js",
          banner,
        },
        {
          format: "iife",
          name: "vaniy",
          entryFileNames: "vaniy.min.js",
          banner,
          plugins: [minifyPlugin()],
        },
      ],
      plugins: [
        filesize({
          showMinifiedSize: false,
          showGzippedSize: true,
          showBrotliSize: true,
        }),
      ],
    },
  },
});
