import { defineConfig, type Plugin } from "vite";

/**
 * Tells the browser about the map code and the main fonts in the HTML itself, so it starts downloading them while
 * it is still reading the page instead of after the app's script runs. Cloudflare Pages also turns the
 * `modulepreload` links into Early Hints (a 103 response sent before the page), so they start even sooner.
 */
function preloadCritical(): Plugin {
  return {
    name: "preload-critical",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {});
        const tags = [];
        for (const f of files.filter((f) => /^assets\/(maplibre|map)-.*\.js$/.test(f))) {
          tags.push({ tag: "link", attrs: { rel: "modulepreload", href: `/${f}` }, injectTo: "head" as const });
        }
        // the Latin subsets the page actually uses straight away
        for (const f of files.filter((f) => /^assets\/(plus-jakarta-sans|jetbrains-mono)-latin-wght-.*\.woff2$/.test(f))) {
          tags.push({ tag: "link", attrs: { rel: "preload", href: `/${f}`, as: "font", type: "font/woff2", crossorigin: "" }, injectTo: "head" as const });
        }
        return tags;
      },
    },
  };
}

export default defineConfig({
  plugins: [preloadCritical()],
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
