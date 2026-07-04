import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the static landing site into ../docs so GitHub Pages can serve it
// from the `main` branch /docs folder. `base` matches the repo name so asset
// URLs resolve at https://<user>.github.io/waitwise/.
export default defineConfig({
  plugins: [react()],
  base: "/waitwise/",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
});
