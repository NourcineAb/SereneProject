// Post-export step: copy web-config.js -> dist/config.js and inject a <script>
// tag into dist/index.html so the API base URL is read at RUNTIME (not baked
// into the bundle). This lets the backend URL be changed by editing dist/config.js
// (or web-config.js) and redeploying ONLY that file — no full rebuild needed.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const src = path.join(root, "web-config.js");
const dest = path.join(dist, "config.js");
const html = path.join(dist, "index.html");

if (!fs.existsSync(dist)) {
  console.error("dist/ not found — run `expo export --platform web` first.");
  process.exit(1);
}

fs.copyFileSync(src, dest);
console.log("Copied web-config.js -> dist/config.js");

let htmlContent = fs.readFileSync(html, "utf8");
if (!htmlContent.includes("/config.js")) {
  htmlContent = htmlContent.replace(
    /(<script\s+src="\/_expo\/static\/js\/web\/[^"]+"[^>]*>)/,
    '<script src="/config.js"></script>\n  $1'
  );
  fs.writeFileSync(html, htmlContent);
  console.log("Injected <script src=\"/config.js\"> into index.html");
} else {
  console.log("config.js script already present in index.html");
}
