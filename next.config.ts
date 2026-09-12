import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Satori and its WASM loaders external. Turbopack otherwise bundles
  // harfbuzzjs with a synthetic `/ROOT/node_modules/...` __dirname and then
  // cannot locate its hb.wasm file during build or at runtime.
  serverExternalPackages: ["satori", "harfbuzzjs", "yoga-layout"],
  // The compose engine reads font .ttf files at runtime via fs.readFileSync
  // (to embed them into generated pin images). Next's automatic file
  // tracing doesn't reliably pick up dynamic fs reads, so without this the
  // fonts folder can get left out of the Vercel deployment bundle —
  // causing text to silently fall back to missing-glyph rendering in
  // production even though it works fine locally.
  // Same reasoning applies to satori's WASM dependencies (yoga-layout's
  // layout engine and harfbuzzjs's text shaper) — satori is what
  // converts our font + text into vector paths so pins render correctly
  // without any system-installed fonts. These .wasm files are loaded
  // dynamically at runtime, not via static import, so Next's automatic
  // tracing can miss them too. We saw this fail during a local
  // production build (harfbuzzjs/hb.wasm ENOENT) before adding this.
  outputFileTracingIncludes: {
    "/api/generate/route": [
      "./src/lib/fonts/**",
      "./node_modules/satori/**",
      "./node_modules/yoga-layout/**",
      "./node_modules/harfbuzzjs/**",
    ],
  },
};

export default nextConfig;
