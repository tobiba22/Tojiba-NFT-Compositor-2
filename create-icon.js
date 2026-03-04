// Generates assets/icon.png — the app icon for Windows and Mac builds.
// Run once with: node create-icon.js
// Requires the `canvas` package (already in dependencies).

const { createCanvas } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

const SIZE = 1024;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext("2d");

const S = SIZE;
const BW = 18; // outer bevel thickness
const IB = BW * 2.2; // inner bevel offset

// ── Background ────────────────────────────────────────────────────────────────
ctx.fillStyle = "#D4D0C8";
ctx.fillRect(0, 0, S, S);

// ── Outer bevel ───────────────────────────────────────────────────────────────
// Top + left edge: bright highlight
ctx.strokeStyle = "#FFFFFF";
ctx.lineWidth = BW;
ctx.beginPath();
ctx.moveTo(BW / 2, S - BW / 2);
ctx.lineTo(BW / 2, BW / 2);
ctx.lineTo(S - BW / 2, BW / 2);
ctx.stroke();

// Bottom + right edge: dark shadow
ctx.strokeStyle = "#404040";
ctx.beginPath();
ctx.moveTo(S - BW / 2, BW / 2);
ctx.lineTo(S - BW / 2, S - BW / 2);
ctx.lineTo(BW / 2, S - BW / 2);
ctx.stroke();

// ── Inner bevel ───────────────────────────────────────────────────────────────
ctx.lineWidth = BW * 0.8;

// Top + left inner edge: soft light
ctx.strokeStyle = "#EAE8E2";
ctx.beginPath();
ctx.moveTo(IB, S - IB);
ctx.lineTo(IB, IB);
ctx.lineTo(S - IB, IB);
ctx.stroke();

// Bottom + right inner edge: medium shadow
ctx.strokeStyle = "#888880";
ctx.beginPath();
ctx.moveTo(S - IB, IB);
ctx.lineTo(S - IB, S - IB);
ctx.lineTo(IB, S - IB);
ctx.stroke();

// ── Text ──────────────────────────────────────────────────────────────────────
ctx.font = "bold 380px Arial";
ctx.textAlign = "center";
ctx.textBaseline = "middle";

// Emboss layer 1: white highlight offset down-right
ctx.fillStyle = "#FFFFFF";
ctx.fillText("TC2", S / 2 + 5, S / 2 + 7);

// Emboss layer 2: mid-tone shadow offset up-left
ctx.fillStyle = "#A8A49C";
ctx.fillText("TC2", S / 2 - 3, S / 2 - 3);

// Main text: near-black
ctx.fillStyle = "#2C2A26";
ctx.fillText("TC2", S / 2, S / 2);

// ── Save ──────────────────────────────────────────────────────────────────────
const assetsDir = path.join(__dirname, "assets");
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir);

const outPath = path.join(assetsDir, "icon.png");
fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log("Icon saved → assets/icon.png");
