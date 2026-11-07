import { defineConfig } from "vite";

// Relative asset paths, so the build works from any folder
// (it is served from www.mgoat.us/games/Symmetro/).
export default defineConfig({
  base: "./",
  build: { outDir: "dist", assetsInlineLimit: 0 },
});
