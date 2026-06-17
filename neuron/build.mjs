import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["bin/neurus.ts"],
    outfile: "dist/neurus.js",
    banner: { js: "#!/usr/bin/env node" },
  }),
  build({
    ...shared,
    entryPoints: ["bin/mcp.ts"],
    outfile: "dist/mcp.js",
    banner: { js: "#!/usr/bin/env node" },
  }),
]);

console.log("built dist/neurus.js  dist/mcp.js");
