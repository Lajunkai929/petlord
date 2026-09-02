import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.PETLORD_API_PROXY_TARGET ?? "http://127.0.0.1:4312";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4310,
    proxy: {
      "/api": apiTarget,
    },
  },
});
