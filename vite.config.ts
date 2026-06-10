import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { compression } from "vite-plugin-compression2";

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "/VIC-Vehicle-Regos/",
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
          if (id.includes("node_modules/@arcgis/core/")) return "arcgis";
          if (id.includes("node_modules/@esri/calcite-components")) return "calcite";
          if (id.includes("node_modules/echarts")) return "echarts";
          return undefined;
        },
      },
    },
  },
}));
