import { defineConfig } from "vite";

// base: "./" makes all built asset URLs relative, so the app works whether it's
// served from a domain root or a GitHub Pages project subpath (/<repo>/).
export default defineConfig({
  base: "./",
});
