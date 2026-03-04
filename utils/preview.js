const basePath = process.cwd();
const fs = require("fs");
const { createCanvas, loadImage } = require(`${basePath}/node_modules/@napi-rs/canvas`);

const buildDir = `${basePath}/build`;
const imagesDir = `${buildDir}/images`;

const THUMB_PER_ROW = 5;
const THUMB_SIZE = 150;

(async () => {
  const files = fs
    .readdirSync(imagesDir)
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => Number(a.replace(".png", "")) - Number(b.replace(".png", "")));

  if (files.length === 0) {
    console.error("No images found in build/images/");
    process.exit(1);
  }

  const cols = Math.min(THUMB_PER_ROW, files.length);
  const rows = Math.ceil(files.length / cols);
  const canvas = createCanvas(cols * THUMB_SIZE, rows * THUMB_SIZE);
  const ctx = canvas.getContext("2d");

  for (let i = 0; i < files.length; i++) {
    const img = await loadImage(`${imagesDir}/${files[i]}`);
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.drawImage(img, col * THUMB_SIZE, row * THUMB_SIZE, THUMB_SIZE, THUMB_SIZE);
  }

  const outPath = `${buildDir}/preview.png`;
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`Preview saved to ${outPath}`);
})();
