import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * 在 build 時算出版本字串,注入成 __APP_VERSION__:
 * package.json 的版本 + 目前 commit 短雜湊(非 main 分支再附上分支名),
 * 例如 `2.0.0-alpha.0 · 9c51f23` 或 `… · feature@ab12cd3`。git 取不到就退回純版本。
 */
function appVersion(): string {
  const pkg = createRequire(import.meta.url)("./package.json") as { version: string };
  const git = (cmd: string) => execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  try {
    const hash = git("git rev-parse --short HEAD");
    const branch = git("git rev-parse --abbrev-ref HEAD");
    const ref = branch && branch !== "main" && branch !== "HEAD" ? `${branch}@${hash}` : hash;
    return `${pkg.version} · ${ref}`;
  } catch {
    return pkg.version;
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  server: { port: 5173 },
});
