import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The version is read from package.json so the bundle can never drift from the
// manifest. Nothing else in the source hardcodes a version or the product name.
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", new URL(import.meta.url)), "utf8"),
) as { version: string };

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": src,
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
