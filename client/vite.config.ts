import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development, Vite forwards API and auth calls to Express, so the browser sees one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/auth": "http://localhost:4000",
    },
  },
});
