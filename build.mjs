import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import * as esbuild from "esbuild";

const root = "/home/claude/work/build";
const web = "/home/claude/work/web";
const out = "/home/claude/work/out";
const N = 64, H = 5;

// 1. JS bundle (React + app), minified
const js = (await esbuild.build({
  entryPoints: [path.join(root, "src/app.jsx")],
  bundle: true, minify: true, format: "iife", write: false,
  jsx: "automatic", target: ["es2019"],
  define: { "process.env.NODE_ENV": '"production"' },
  nodePaths: [path.join(root, "node_modules")],
})).outputFiles[0].text;
const adminHash = crypto.createHash("sha256").update("Irshath@2026").digest("hex");
const jsFinal = js.replace('"__ADMIN_HASH__"', JSON.stringify(adminHash));
if (!jsFinal.includes(adminHash)) throw new Error("admin hash not injected");
if (jsFinal.includes("</script")) throw new Error("script tag inside bundle");

// 2. CSS: Bootstrap + Font Awesome (fonts inlined) + our styles
const fontDir = path.join(root, "node_modules/@fortawesome/fontawesome-free/webfonts");
let fa = fs.readFileSync(path.join(root, "node_modules/@fortawesome/fontawesome-free/css/all.min.css"), "utf8");
fa = fa.replace(/url\(\.\.\/webfonts\/([\w.-]+)\.woff2\)/g, (m, name) =>
  `url(data:font/woff2;base64,${fs.readFileSync(path.join(fontDir, name + ".woff2")).toString("base64")})`);
fa = fa.replace(/,url\(\.\.\/webfonts\/[^)]+\)\s*format\("(truetype|woff)"\)/g, "");
const bs = fs.readFileSync(path.join(root, "node_modules/bootstrap/dist/css/bootstrap.min.css"), "utf8");
const css = [bs, fa, fs.readFileSync(path.join(root, "src/style.css"), "utf8"), fs.readFileSync(path.join(root, "src/extra.css"), "utf8")].join("\n");

const template = fs.readFileSync(path.join(root, "template.html"), "utf8");
const b64 = (f) => "data:image/jpeg;base64," + fs.readFileSync(f).toString("base64");
const pad = (n) => String(n).padStart(2, "0");

function build(mode) {
  const dir = mode === "embed" ? out + "/single" : out + "/irshath-website";
  fs.mkdirSync(dir, { recursive: true });
  let arts = [], heroes = [], logo;
  if (mode === "embed") {
    for (let i = 1; i <= N; i++) arts.push(b64(`${web}/art-${pad(i)}.jpg`));
    for (let i = 1; i <= H; i++) heroes.push(b64(`${web}/hero-${pad(i)}.jpg`));
    logo = b64(`${web}/logo.jpg`);
  } else {
    fs.mkdirSync(dir + "/assets", { recursive: true });
    for (let i = 1; i <= N; i++) {
      fs.copyFileSync(`${web}/art-${pad(i)}.jpg`, `${dir}/assets/art-${pad(i)}.jpg`);
      arts.push(`assets/art-${pad(i)}.jpg`);
    }
    for (let i = 1; i <= H; i++) {
      fs.copyFileSync(`${web}/hero-${pad(i)}.jpg`, `${dir}/assets/hero-${pad(i)}.jpg`);
      heroes.push(`assets/hero-${pad(i)}.jpg`);
    }
    fs.copyFileSync(`${web}/logo.jpg`, `${dir}/assets/logo.jpg`);
    logo = "assets/logo.jpg";
  }
  const html = template
    .replace("/*__CSS__*/", () => css)
    .replace("/*__ART__*/[]", () => JSON.stringify(arts))
    .replace("/*__HERO__*/[]", () => JSON.stringify(heroes))
    .replace('/*__LOGO__*/""', () => JSON.stringify(logo))
    .replace("/*__JS__*/", () => jsFinal);
  fs.writeFileSync(mode === "embed" ? `${dir}/irshath-artist-website-v2.html` : `${dir}/index.html`, html);
  return html.length;
}
console.log("single html bytes:", build("embed"));
console.log("folder index bytes:", build("files"));
