import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the static landing site into ../docs so GitHub Pages can serve it
// from the `main` branch /docs folder. base "/" is for serving at the custom
// domain root (waitwise.co.uk). The public/CNAME file points Pages at the domain.
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
});
