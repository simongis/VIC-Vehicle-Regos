import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { compression } from "vite-plugin-compression2";

export default defineConfig({
  base: "/VIC-Vehicle-Regos/",
  plugins: [
    react(),
    // Pre-compress static assets (including the vehicles_*.json data files)
    compression({ algorithm: "gzip", exclude: [/\.(png|jpe?g|gif|webp|svg)$/] }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split the big vendor libraries into their own chunks (they change
        // rarely). Use the function form keyed on module id: @arcgis/core has
        // subpath-only "exports" with no main entry, so the array form
        // (["@arcgis/core"]) makes Rollup try to resolve the bare package as a
        // chunk entry and the build fails. Matching on the id avoids that.
        manualChunks(id) {
          // Split @arcgis/core by submodule rather than one ~12 MB chunk: a single
          // giant chunk pushed the build's V8 heap over the limit (OOM). Smaller
          // per-submodule chunks keep peak memory down and parallelise better.
          if (id.includes("node_modules/@arcgis/core/")) {
            const seg = (id.split("node_modules/@arcgis/core/")[1] || "").split("/")[0] || "core";
            return `arcgis-${seg}`;
          }
          if (id.includes("node_modules/@esri/calcite-components")) return "calcite";
          if (id.includes("node_modules/echarts")) return "echarts";
          return undefined;
        },
      },
    },
  },
});
