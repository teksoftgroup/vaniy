import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import esbuild from "rollup-plugin-esbuild";
import terser from "@rollup/plugin-terser";
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

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";

  const terserPlugin = terser({
    format: {
      comments: /^!/,
    },
    compress: true,
    mangle: true,
  });

  return {
    test: {
      environment: "jsdom",
    },
    build: {
      lib: {
        entry: "src/index.js",
        name: "vaniy",
      },

      minify: false,
      rollupOptions: {
        output: [
          {
            format: "es",
            entryFileNames: "vaniy.es.js",
            exports: "named",
            banner,
            sourcemap: !isProd,
          },
          {
            format: "umd",
            name: "vaniy",
            entryFileNames: isProd ? "vaniy.umd.min.js" : "vaniy.umd.js",
            exports: "named",
            banner,
            sourcemap: !isProd,
            plugins: isProd ? [terser()] : [],
          },
          {
            format: "iife",
            name: "vaniy",
            entryFileNames: isProd ? "vaniy.iife.min.js" : "vaniy.iife.js",
            banner,
            plugins: isProd ? [terser()] : [],
            sourcemap: !isProd,
          },
        ],
        plugins: [
          ...(isProd
            ? [
                filesize({
                  showMinifiedSize: false,
                  showGzippedSize: true,
                  showBrotliSize: true,
                }),
              ]
            : []),
        ],
      },
    },
  };
});
