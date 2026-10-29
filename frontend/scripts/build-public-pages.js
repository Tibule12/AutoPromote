#!/usr/bin/env node
// Static hosts need physical entry files; their 404 cannot run our React router.
// Informational pages share their actual React content with their static HTML.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const webpack = require("webpack");
const root = path.resolve(__dirname, "..");
const build = path.resolve(root, process.env.BUILD_PATH || "build");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-public-pages-"));
const bundle = path.join(scratch, "pages.cjs");

const config = {
  mode: "production",
  target: "node",
  entry: path.join(__dirname, "public-pages-entry.js"),
  output: { path: scratch, filename: "pages.cjs", library: { type: "commonjs2" } },
  devtool: false,
  externals: Object.fromEntries(
    ["react", "react-dom/server", "react-router"].map(name => [
      name,
      `commonjs ${require.resolve(name)}`,
    ])
  ),
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: require.resolve("babel-loader"),
          options: {
            babelrc: false,
            configFile: false,
            presets: [[require.resolve("@babel/preset-react"), { runtime: "automatic" }]],
          },
        },
      },
      { test: /\.svg$/, type: "asset/inline" },
      { test: /\.css$/, type: "asset/source" },
    ],
  },
  optimization: { minimize: false },
};

webpack(config, (error, stats) => {
  try {
    if (error || stats?.hasErrors())
      throw error || new Error(stats.toString({ all: false, errors: true }));
    const { footerRoutes, nestedRoutes, renderPublicPage } = require(bundle);
    const shell = fs.readFileSync(path.join(build, "index.html"), "utf8");
    if (!shell.includes('<div id="root"></div>'))
      throw new Error("Missing application root in production HTML");
    const styles = [
      "src/components/public/PublicPage.css",
      "src/components/public/CompanyPages.css",
      "src/components/AutoPromoteLogo.css",
    ].map(file => fs.readFileSync(path.join(root, file), "utf8"));
    fs.writeFileSync(path.join(build, "company-pages.css"), `body{margin:0}\n${styles.join("\n")}`);
    let generated = 0;
    for (const route of new Set([...footerRoutes, ...nestedRoutes])) {
      if (!/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(route))
        throw new Error("Unexpected public route");
      const destination = path.join(build, route.slice(1), "index.html");
      // Keep the existing standalone legal policies and their exact text.
      if (["/privacy", "/terms"].includes(route)) {
        if (!fs.existsSync(destination)) throw new Error(`Missing existing policy: ${route}`);
        continue;
      }
      let html = shell;
      const rendered = renderPublicPage(route);
      if (rendered) {
        const title = rendered.match(/<h1>([^<]+)<\/h1>/)?.[1];
        const description = rendered.match(/<p class="public-intro">([^<]+)<\/p>/)?.[1];
        if (!title || !description) throw new Error(`Missing page identity: ${route}`);
        // Use a replacer: rendered content must never be interpreted as $& or $1.
        html = html
          .replace('<div id="root"></div>', () => `<div id="root">${rendered}</div>`)
          .replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`)
          .replace(/<meta property="(?:og|twitter):title" content="[^"]*"/g, match =>
            match.replace(/content="[^"]*"/, `content="${title}"`)
          )
          .replace(/<meta property="(?:og|twitter):description" content="[^"]*"/g, match =>
            match.replace(/content="[^"]*"/, `content="${description}"`)
          )
          .replace(
            /(<meta name="description" content=")[^"]*(")/,
            () => `<meta name="description" content="${description}"`
          )
          .replace(
            "</head>",
            `<link rel="stylesheet" href="/company-pages.css"/><link rel="canonical" href="https://autopromote.org${route}/"/></head>`
          )
          .replace(/<noscript>[\s\S]*?<\/noscript>/, "");
      } else {
        html = html.replace(
          "</head>",
          `<link rel="canonical" href="https://autopromote.org${route}/"/></head>`
        );
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, html);
      generated++;
    }
    console.log(
      `Built ${generated} public entry pages from the actual components; existing policies preserved. Pricing, support and guide details retain their normal client-side services.`
    );
  } catch (failure) {
    console.error(failure.message);
    process.exitCode = 1;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
