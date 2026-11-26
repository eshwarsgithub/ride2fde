import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // MapLibre is most of the JavaScript; in its own file it stays cached between our deploys.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: { maplibre: ["maplibre-gl"] },
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8788",
    },
  },
});
