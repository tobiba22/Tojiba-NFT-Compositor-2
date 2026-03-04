/**
 * Vector art layer generator for Dog PFP NFT collection.
 * Run once:  node generate_layers.js
 * Then delete this file — the PNGs in layers/ are all you need.
 */
const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const SIZE = 512;

function makeCanvas() {
  const c = createCanvas(SIZE, SIZE);
  return [c, c.getContext("2d")];
}

function save(folder, filename, canvas) {
  const dir = path.join(__dirname, "layers", folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), canvas.toBuffer("image/png"));
}

// ============================================================================
//  HELPERS
// ============================================================================

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function ellipse(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.closePath();
}

function circle(ctx, cx, cy, r) {
  ellipse(ctx, cx, cy, r, r);
}

function triangle(ctx, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
}

function star(ctx, cx, cy, outerR, innerR, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function diamond(ctx, cx, cy, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
}

// ============================================================================
//  1. BACKGROUNDS  (BG)
// ============================================================================

function generateBGs() {
  // Solid Sky Blue
  {
    const [c, ctx] = makeCanvas();
    ctx.fillStyle = "#87CEEB";
    ctx.fillRect(0, 0, SIZE, SIZE);
    save("BG", "sky_blue#40.png", c);
  }
  // Warm Sunset gradient
  {
    const [c, ctx] = makeCanvas();
    const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
    grad.addColorStop(0, "#FF6B35");
    grad.addColorStop(0.5, "#F7C948");
    grad.addColorStop(1, "#FFE66D");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
    save("BG", "sunset#25.png", c);
  }
  // Mint Green
  {
    const [c, ctx] = makeCanvas();
    ctx.fillStyle = "#98D8AA";
    ctx.fillRect(0, 0, SIZE, SIZE);
    save("BG", "mint#20.png", c);
  }
  // Lavender
  {
    const [c, ctx] = makeCanvas();
    ctx.fillStyle = "#C3AED6";
    ctx.fillRect(0, 0, SIZE, SIZE);
    save("BG", "lavender#10.png", c);
  }
  // Bubblegum Pink
  {
    const [c, ctx] = makeCanvas();
    const grad = ctx.createRadialGradient(256, 256, 50, 256, 256, 360);
    grad.addColorStop(0, "#FFB6C1");
    grad.addColorStop(1, "#FF69B4");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
    save("BG", "bubblegum#5.png", c);
  }
  console.log("  BG: 5 variants");
}

// ============================================================================
//  2. SHADOW  (cast shadow under dog)
// ============================================================================

function generateShadows() {
  // Standard shadow
  {
    const [c, ctx] = makeCanvas();
    ellipse(ctx, 256, 430, 120, 25);
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fill();
    save("Shadow", "standard#50.png", c);
  }
  // Large shadow
  {
    const [c, ctx] = makeCanvas();
    ellipse(ctx, 256, 435, 150, 30);
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fill();
    save("Shadow", "large#25.png", c);
  }
  // Small shadow
  {
    const [c, ctx] = makeCanvas();
    ellipse(ctx, 256, 425, 90, 18);
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.fill();
    save("Shadow", "small#25.png", c);
  }
  console.log("  Shadow: 3 variants");
}

// ============================================================================
//  3. DOG  (base dog head shape — cartoon front-facing)
// ============================================================================

function drawDogBase(ctx, bodyColor, earColor, innerEarColor, outlineColor) {
  const ol = outlineColor || "#2C2C2C";
  const lw = 4;

  // ---- Ears (behind head) ----
  // Left ear — floppy
  ctx.save();
  ctx.translate(145, 155);
  ctx.rotate(-0.3);
  roundRect(ctx, -35, -60, 70, 120, 20);
  ctx.fillStyle = earColor;
  ctx.fill();
  ctx.strokeStyle = ol;
  ctx.lineWidth = lw;
  ctx.stroke();
  // Inner ear
  roundRect(ctx, -20, -40, 40, 80, 12);
  ctx.fillStyle = innerEarColor;
  ctx.fill();
  ctx.restore();

  // Right ear — floppy
  ctx.save();
  ctx.translate(367, 155);
  ctx.rotate(0.3);
  roundRect(ctx, -35, -60, 70, 120, 20);
  ctx.fillStyle = earColor;
  ctx.fill();
  ctx.strokeStyle = ol;
  ctx.lineWidth = lw;
  ctx.stroke();
  roundRect(ctx, -20, -40, 40, 80, 12);
  ctx.fillStyle = innerEarColor;
  ctx.fill();
  ctx.restore();

  // ---- Head ----
  roundRect(ctx, 130, 110, 252, 260, 80);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = ol;
  ctx.lineWidth = lw;
  ctx.stroke();

  // ---- Muzzle (lighter area) ----
  ellipse(ctx, 256, 290, 75, 60);
  ctx.fillStyle = "#FFF5E6";
  ctx.fill();
  ctx.strokeStyle = ol;
  ctx.lineWidth = 2;
  ctx.stroke();

  // ---- Body (lower torso visible) ----
  roundRect(ctx, 160, 340, 192, 120, 40);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = ol;
  ctx.lineWidth = lw;
  ctx.stroke();

  // Chest patch
  ellipse(ctx, 256, 370, 50, 40);
  ctx.fillStyle = "#FFF5E6";
  ctx.fill();
}

function generateDogs() {
  const dogs = [
    { name: "golden#35",   body: "#F5C16C", ear: "#D4A24E", innerEar: "#FADCAA" },
    { name: "brown#25",    body: "#8B5E3C", ear: "#6B3F22", innerEar: "#C9956B" },
    { name: "white#20",    body: "#F5F0E8", ear: "#E0D5C5", innerEar: "#FFF8F0" },
    { name: "black#15",    body: "#3C3C3C", ear: "#2A2A2A", innerEar: "#666666" },
    { name: "spotted#5",   body: "#F5F0E8", ear: "#8B5E3C", innerEar: "#FADCAA" },
  ];

  for (const dog of dogs) {
    const [c, ctx] = makeCanvas();
    drawDogBase(ctx, dog.body, dog.ear, dog.innerEar);

    // Spotted gets patches
    if (dog.name.startsWith("spotted")) {
      ctx.fillStyle = "#8B5E3C";
      circle(ctx, 200, 200, 25);
      ctx.fill();
      circle(ctx, 310, 180, 20);
      ctx.fill();
      circle(ctx, 280, 250, 18);
      ctx.fill();
    }
    save("Dog", `${dog.name}.png`, c);
  }
  console.log("  Dog: 5 variants");
}

// ============================================================================
//  4. EYES
// ============================================================================

function generateEyes() {
  function drawEyeBase(ctx, leftX, rightX, y, eyeW, eyeH) {
    // White sclera
    ellipse(ctx, leftX, y, eyeW, eyeH);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#2C2C2C";
    ctx.lineWidth = 3;
    ctx.stroke();

    ellipse(ctx, rightX, y, eyeW, eyeH);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#2C2C2C";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const lx = 220, rx = 292, ey = 220;

  // Normal eyes (dark brown)
  {
    const [c, ctx] = makeCanvas();
    drawEyeBase(ctx, lx, rx, ey, 24, 26);
    // Pupils
    circle(ctx, lx, ey, 12);
    ctx.fillStyle = "#3B2314";
    ctx.fill();
    circle(ctx, rx, ey, 12);
    ctx.fill();
    // Shine
    circle(ctx, lx + 5, ey - 6, 5);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    circle(ctx, rx + 5, ey - 6, 5);
    ctx.fill();
    save("Eyes", "normal#35.png", c);
  }

  // Blue eyes
  {
    const [c, ctx] = makeCanvas();
    drawEyeBase(ctx, lx, rx, ey, 24, 26);
    circle(ctx, lx, ey, 14);
    ctx.fillStyle = "#4A90D9";
    ctx.fill();
    circle(ctx, rx, ey, 14);
    ctx.fill();
    circle(ctx, lx, ey, 7);
    ctx.fillStyle = "#1A1A2E";
    ctx.fill();
    circle(ctx, rx, ey, 7);
    ctx.fill();
    circle(ctx, lx + 5, ey - 6, 5);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    circle(ctx, rx + 5, ey - 6, 5);
    ctx.fill();
    save("Eyes", "blue#20.png", c);
  }

  // Happy closed eyes (^  ^)
  {
    const [c, ctx] = makeCanvas();
    ctx.strokeStyle = "#2C2C2C";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    // Left arc
    ctx.beginPath();
    ctx.arc(lx, ey + 5, 16, Math.PI + 0.3, -0.3);
    ctx.stroke();
    // Right arc
    ctx.beginPath();
    ctx.arc(rx, ey + 5, 16, Math.PI + 0.3, -0.3);
    ctx.stroke();
    save("Eyes", "happy#20.png", c);
  }

  // Heart eyes
  {
    const [c, ctx] = makeCanvas();
    function drawHeart(cx, cy, size) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + size * 0.3);
      ctx.bezierCurveTo(cx, cy - size * 0.3, cx - size, cy - size * 0.3, cx - size, cy + size * 0.1);
      ctx.bezierCurveTo(cx - size, cy + size * 0.6, cx, cy + size, cx, cy + size);
      ctx.bezierCurveTo(cx, cy + size, cx + size, cy + size * 0.6, cx + size, cy + size * 0.1);
      ctx.bezierCurveTo(cx + size, cy - size * 0.3, cx, cy - size * 0.3, cx, cy + size * 0.3);
      ctx.closePath();
    }
    drawHeart(lx, ey - 10, 18);
    ctx.fillStyle = "#FF4466";
    ctx.fill();
    ctx.strokeStyle = "#CC1133";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawHeart(rx, ey - 10, 18);
    ctx.fillStyle = "#FF4466";
    ctx.fill();
    ctx.strokeStyle = "#CC1133";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Shine
    circle(ctx, lx - 4, ey - 10, 4);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fill();
    circle(ctx, rx - 4, ey - 10, 4);
    ctx.fill();
    save("Eyes", "heart#10.png", c);
  }

  // Sunglasses (cool)
  {
    const [c, ctx] = makeCanvas();
    ctx.fillStyle = "#1A1A1A";
    // Left lens
    roundRect(ctx, lx - 32, ey - 20, 60, 40, 8);
    ctx.fill();
    // Right lens
    roundRect(ctx, rx - 28, ey - 20, 60, 40, 8);
    ctx.fill();
    // Bridge
    ctx.strokeStyle = "#1A1A1A";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(lx + 28, ey);
    ctx.lineTo(rx - 28, ey);
    ctx.stroke();
    // Arms
    ctx.beginPath();
    ctx.moveTo(lx - 32, ey - 8);
    ctx.lineTo(lx - 55, ey - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx + 32, ey - 8);
    ctx.lineTo(rx + 55, ey - 12);
    ctx.stroke();
    // Lens shine
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lx - 15, ey - 12);
    ctx.lineTo(lx - 5, ey - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx - 11, ey - 12);
    ctx.lineTo(rx - 1, ey - 12);
    ctx.stroke();
    save("Eyes", "sunglasses#15.png", c);
  }

  console.log("  Eyes: 5 variants");
}

// ============================================================================
//  5. NOSE
// ============================================================================

function generateNoses() {
  const nx = 256, ny = 278;

  // Classic black nose
  {
    const [c, ctx] = makeCanvas();
    // Nose body — rounded triangle
    ctx.beginPath();
    ctx.moveTo(nx, ny - 12);
    ctx.bezierCurveTo(nx - 22, ny - 8, nx - 22, ny + 12, nx, ny + 10);
    ctx.bezierCurveTo(nx + 22, ny + 12, nx + 22, ny - 8, nx, ny - 12);
    ctx.closePath();
    ctx.fillStyle = "#1A1A1A";
    ctx.fill();
    // Shine
    ellipse(ctx, nx - 4, ny - 5, 5, 3);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fill();
    save("Nose", "black#45.png", c);
  }

  // Pink nose
  {
    const [c, ctx] = makeCanvas();
    ctx.beginPath();
    ctx.moveTo(nx, ny - 12);
    ctx.bezierCurveTo(nx - 20, ny - 8, nx - 20, ny + 12, nx, ny + 10);
    ctx.bezierCurveTo(nx + 20, ny + 12, nx + 20, ny - 8, nx, ny - 12);
    ctx.closePath();
    ctx.fillStyle = "#FFB0B0";
    ctx.fill();
    ctx.strokeStyle = "#CC7777";
    ctx.lineWidth = 2;
    ctx.stroke();
    ellipse(ctx, nx - 3, ny - 4, 4, 3);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();
    save("Nose", "pink#30.png", c);
  }

  // Brown nose
  {
    const [c, ctx] = makeCanvas();
    ctx.beginPath();
    ctx.moveTo(nx, ny - 12);
    ctx.bezierCurveTo(nx - 22, ny - 8, nx - 22, ny + 12, nx, ny + 10);
    ctx.bezierCurveTo(nx + 22, ny + 12, nx + 22, ny - 8, nx, ny - 12);
    ctx.closePath();
    ctx.fillStyle = "#5C3A1E";
    ctx.fill();
    ellipse(ctx, nx - 4, ny - 5, 5, 3);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
    save("Nose", "brown#20.png", c);
  }

  // Red/clown nose
  {
    const [c, ctx] = makeCanvas();
    circle(ctx, nx, ny, 14);
    ctx.fillStyle = "#FF3333";
    ctx.fill();
    ctx.strokeStyle = "#CC0000";
    ctx.lineWidth = 2;
    ctx.stroke();
    circle(ctx, nx - 4, ny - 5, 5);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();
    save("Nose", "clown#5.png", c);
  }

  console.log("  Nose: 4 variants");
}

// ============================================================================
//  6. MOUTH
// ============================================================================

function generateMouths() {
  const mx = 256, my = 310;

  // Happy smile
  {
    const [c, ctx] = makeCanvas();
    ctx.strokeStyle = "#2C2C2C";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(mx, my - 8, 28, 0.2, Math.PI - 0.2);
    ctx.stroke();
    save("Mouth", "smile#35.png", c);
  }

  // Open smile with tongue
  {
    const [c, ctx] = makeCanvas();
    // Open mouth shape
    ctx.beginPath();
    ctx.arc(mx, my - 5, 26, 0.1, Math.PI - 0.1);
    ctx.closePath();
    ctx.fillStyle = "#4A1A1A";
    ctx.fill();
    ctx.strokeStyle = "#2C2C2C";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Tongue
    ellipse(ctx, mx, my + 12, 16, 12);
    ctx.fillStyle = "#FF7788";
    ctx.fill();
    ctx.strokeStyle = "#CC5566";
    ctx.lineWidth = 2;
    ctx.stroke();
    save("Mouth", "tongue_out#20.png", c);
  }

  // Neutral line
  {
    const [c, ctx] = makeCanvas();
    ctx.strokeStyle = "#2C2C2C";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(mx - 20, my);
    ctx.lineTo(mx + 20, my);
    ctx.stroke();
    save("Mouth", "neutral#25.png", c);
  }

  // Grin (teeth showing)
  {
    const [c, ctx] = makeCanvas();
    // Open mouth
    ctx.beginPath();
    ctx.arc(mx, my - 3, 30, 0.05, Math.PI - 0.05);
    ctx.closePath();
    ctx.fillStyle = "#4A1A1A";
    ctx.fill();
    ctx.strokeStyle = "#2C2C2C";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Teeth row
    ctx.fillStyle = "#FFFFFF";
    for (let i = -2; i <= 2; i++) {
      roundRect(ctx, mx + i * 12 - 5, my - 8, 10, 10, 2);
      ctx.fill();
    }
    save("Mouth", "grin#15.png", c);
  }

  // Tiny "o" (surprised)
  {
    const [c, ctx] = makeCanvas();
    circle(ctx, mx, my + 2, 10);
    ctx.fillStyle = "#4A1A1A";
    ctx.fill();
    ctx.strokeStyle = "#2C2C2C";
    ctx.lineWidth = 3;
    ctx.stroke();
    save("Mouth", "surprised#5.png", c);
  }

  console.log("  Mouth: 5 variants");
}

// ============================================================================
//  7. SHIRT
// ============================================================================

function generateShirts() {
  const shirtTop = 365;

  function drawShirtBase(ctx, color, strokeColor) {
    ctx.beginPath();
    ctx.moveTo(155, shirtTop);
    ctx.lineTo(155, 470);
    ctx.quadraticCurveTo(155, 500, 185, 500);
    ctx.lineTo(327, 500);
    ctx.quadraticCurveTo(357, 500, 357, 470);
    ctx.lineTo(357, shirtTop);
    // Collar dip
    ctx.quadraticCurveTo(310, shirtTop + 15, 256, shirtTop - 5);
    ctx.quadraticCurveTo(202, shirtTop + 15, 155, shirtTop);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = strokeColor || "#2C2C2C";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Red tee
  {
    const [c, ctx] = makeCanvas();
    drawShirtBase(ctx, "#E84040", "#B02020");
    save("Shirt", "red_tee#30.png", c);
  }

  // Blue tee
  {
    const [c, ctx] = makeCanvas();
    drawShirtBase(ctx, "#4A7FCC", "#2A5FAA");
    save("Shirt", "blue_tee#30.png", c);
  }

  // Striped
  {
    const [c, ctx] = makeCanvas();
    drawShirtBase(ctx, "#FFFFFF", "#AAAAAA");
    // Horizontal stripes
    ctx.save();
    ctx.clip(); // clip to shirt shape
    ctx.fillStyle = "#2255AA";
    for (let y = shirtTop; y < 510; y += 20) {
      ctx.fillRect(140, y, 230, 8);
    }
    ctx.restore();
    // Re-draw stroke
    ctx.beginPath();
    ctx.moveTo(155, shirtTop);
    ctx.lineTo(155, 470);
    ctx.quadraticCurveTo(155, 500, 185, 500);
    ctx.lineTo(327, 500);
    ctx.quadraticCurveTo(357, 500, 357, 470);
    ctx.lineTo(357, shirtTop);
    ctx.quadraticCurveTo(310, shirtTop + 15, 256, shirtTop - 5);
    ctx.quadraticCurveTo(202, shirtTop + 15, 155, shirtTop);
    ctx.closePath();
    ctx.strokeStyle = "#2C2C2C";
    ctx.lineWidth = 3;
    ctx.stroke();
    save("Shirt", "striped#20.png", c);
  }

  // Hoodie (green)
  {
    const [c, ctx] = makeCanvas();
    // Wider hoodie shape
    ctx.beginPath();
    ctx.moveTo(140, shirtTop - 10);
    ctx.lineTo(140, 475);
    ctx.quadraticCurveTo(140, 510, 175, 510);
    ctx.lineTo(337, 510);
    ctx.quadraticCurveTo(372, 510, 372, 475);
    ctx.lineTo(372, shirtTop - 10);
    ctx.quadraticCurveTo(320, shirtTop + 5, 256, shirtTop - 20);
    ctx.quadraticCurveTo(192, shirtTop + 5, 140, shirtTop - 10);
    ctx.closePath();
    ctx.fillStyle = "#3A7D44";
    ctx.fill();
    ctx.strokeStyle = "#2A5D30";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Hoodie strings
    ctx.strokeStyle = "#F0F0F0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(240, shirtTop + 5);
    ctx.lineTo(240, shirtTop + 50);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(272, shirtTop + 5);
    ctx.lineTo(272, shirtTop + 50);
    ctx.stroke();
    // Front pocket
    roundRect(ctx, 210, shirtTop + 60, 92, 40, 8);
    ctx.strokeStyle = "#2A5D30";
    ctx.lineWidth = 2;
    ctx.stroke();
    save("Shirt", "green_hoodie#15.png", c);
  }

  // Hawaiian
  {
    const [c, ctx] = makeCanvas();
    drawShirtBase(ctx, "#FF9944", "#DD7722");
    // Flower pattern
    const flowers = [
      [190, 390], [240, 420], [300, 395], [210, 460], [270, 470], [330, 450],
    ];
    for (const [fx, fy] of flowers) {
      // Petals
      ctx.fillStyle = "#FF4477";
      for (let a = 0; a < 5; a++) {
        const angle = (a * Math.PI * 2) / 5;
        circle(ctx, fx + Math.cos(angle) * 8, fy + Math.sin(angle) * 8, 5);
        ctx.fill();
      }
      // Center
      ctx.fillStyle = "#FFDD44";
      circle(ctx, fx, fy, 4);
      ctx.fill();
    }
    save("Shirt", "hawaiian#5.png", c);
  }

  console.log("  Shirt: 5 variants");
}

// ============================================================================
//  8. NECKLACE
// ============================================================================

function generateNecklaces() {
  const neckY = 350;

  // Gold chain
  {
    const [c, ctx] = makeCanvas();
    ctx.strokeStyle = "#DAA520";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(256, neckY - 30, 65, 0.15, Math.PI - 0.15);
    ctx.stroke();
    // Links shimmer
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(256, neckY - 30, 65, 0.3, 0.8);
    ctx.stroke();
    save("Necklace", "gold_chain#30.png", c);
  }

  // Pendant
  {
    const [c, ctx] = makeCanvas();
    // String
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(256, neckY - 30, 60, 0.2, Math.PI - 0.2);
    ctx.stroke();
    // Pendant gem
    diamond(ctx, 256, neckY + 28, 20, 26);
    ctx.fillStyle = "#44BBFF";
    ctx.fill();
    ctx.strokeStyle = "#2299DD";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Shine
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    circle(ctx, 253, neckY + 22, 3);
    ctx.fill();
    save("Necklace", "blue_pendant#20.png", c);
  }

  // Bandana / collar
  {
    const [c, ctx] = makeCanvas();
    ctx.beginPath();
    ctx.moveTo(175, neckY - 10);
    ctx.quadraticCurveTo(256, neckY + 5, 337, neckY - 10);
    ctx.lineTo(320, neckY + 5);
    ctx.quadraticCurveTo(256, neckY + 40, 192, neckY + 5);
    ctx.closePath();
    ctx.fillStyle = "#DD3333";
    ctx.fill();
    ctx.strokeStyle = "#AA1111";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Knot triangle at center bottom
    triangle(ctx, 245, neckY + 10, 267, neckY + 10, 256, neckY + 35);
    ctx.fillStyle = "#CC2222";
    ctx.fill();
    save("Necklace", "red_bandana#25.png", c);
  }

  // Spiked collar
  {
    const [c, ctx] = makeCanvas();
    // Band
    ctx.beginPath();
    ctx.arc(256, neckY - 25, 62, 0.1, Math.PI - 0.1);
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 12;
    ctx.stroke();
    // Spikes
    ctx.fillStyle = "#C0C0C0";
    const spikeAngles = [0.3, 0.7, 1.1, 1.5, 1.9, 2.3, 2.7];
    for (const a of spikeAngles) {
      const sx = 256 + Math.cos(a) * 62;
      const sy = neckY - 25 + Math.sin(a) * 62;
      triangle(ctx, sx - 5, sy, sx + 5, sy, sx, sy + 14);
      ctx.fill();
      ctx.strokeStyle = "#888888";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    save("Necklace", "spiked_collar#15.png", c);
  }

  // Pearl necklace
  {
    const [c, ctx] = makeCanvas();
    const pearlR = 62;
    for (let a = 0.15; a < Math.PI - 0.1; a += 0.2) {
      const px = 256 + Math.cos(a) * pearlR;
      const py = neckY - 28 + Math.sin(a) * pearlR;
      circle(ctx, px, py, 6);
      ctx.fillStyle = "#FFF8F0";
      ctx.fill();
      ctx.strokeStyle = "#DDCCBB";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Pearl shine
      circle(ctx, px - 2, py - 2, 2);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fill();
    }
    save("Necklace", "pearls#10.png", c);
  }

  console.log("  Necklace: 5 variants");
}

// ============================================================================
//  9. HAT
// ============================================================================

function generateHats() {
  // Baseball cap
  {
    const [c, ctx] = makeCanvas();
    // Brim
    ctx.beginPath();
    ctx.ellipse(256, 138, 100, 20, 0, 0, Math.PI);
    ctx.fillStyle = "#CC3333";
    ctx.fill();
    ctx.strokeStyle = "#991111";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Cap dome
    ctx.beginPath();
    ctx.arc(256, 138, 85, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = "#CC3333";
    ctx.fill();
    ctx.strokeStyle = "#991111";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Cap button on top
    circle(ctx, 256, 56, 6);
    ctx.fillStyle = "#991111";
    ctx.fill();
    // Front panel line
    ctx.strokeStyle = "#991111";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(256, 56);
    ctx.lineTo(256, 138);
    ctx.stroke();
    save("Hat", "red_cap#30.png", c);
  }

  // Top hat
  {
    const [c, ctx] = makeCanvas();
    // Brim
    roundRect(ctx, 170, 118, 172, 18, 9);
    ctx.fillStyle = "#1A1A1A";
    ctx.fill();
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Crown
    roundRect(ctx, 200, 30, 112, 95, 10);
    ctx.fillStyle = "#1A1A1A";
    ctx.fill();
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Band
    ctx.fillStyle = "#CC3333";
    ctx.fillRect(200, 100, 112, 14);
    save("Hat", "top_hat#10.png", c);
  }

  // Beanie
  {
    const [c, ctx] = makeCanvas();
    // Beanie dome
    ctx.beginPath();
    ctx.arc(256, 140, 88, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = "#5544AA";
    ctx.fill();
    ctx.strokeStyle = "#3B2D7D";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Cuff/brim
    roundRect(ctx, 170, 125, 172, 22, 5);
    ctx.fillStyle = "#6655BB";
    ctx.fill();
    ctx.strokeStyle = "#3B2D7D";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Pompom
    circle(ctx, 256, 55, 16);
    ctx.fillStyle = "#7766CC";
    ctx.fill();
    ctx.strokeStyle = "#5544AA";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Knit lines
    ctx.strokeStyle = "#4A3B99";
    ctx.lineWidth = 1;
    for (let y = 80; y < 125; y += 12) {
      ctx.beginPath();
      ctx.arc(256, 140, 88, Math.PI + 0.3, -0.3);
      ctx.stroke();
    }
    save("Hat", "purple_beanie#25.png", c);
  }

  // Crown
  {
    const [c, ctx] = makeCanvas();
    // Crown base
    ctx.beginPath();
    ctx.moveTo(175, 140);
    ctx.lineTo(175, 90);
    ctx.lineTo(200, 110);
    ctx.lineTo(228, 60);
    ctx.lineTo(256, 100);
    ctx.lineTo(284, 60);
    ctx.lineTo(312, 110);
    ctx.lineTo(337, 90);
    ctx.lineTo(337, 140);
    ctx.closePath();
    ctx.fillStyle = "#FFD700";
    ctx.fill();
    ctx.strokeStyle = "#DAA520";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Band
    ctx.fillStyle = "#CC0000";
    ctx.fillRect(175, 125, 162, 15);
    ctx.strokeStyle = "#DAA520";
    ctx.lineWidth = 2;
    ctx.strokeRect(175, 125, 162, 15);
    // Gems
    circle(ctx, 220, 132, 5);
    ctx.fillStyle = "#4488FF";
    ctx.fill();
    circle(ctx, 256, 132, 5);
    ctx.fillStyle = "#44FF44";
    ctx.fill();
    circle(ctx, 292, 132, 5);
    ctx.fillStyle = "#FF4488";
    ctx.fill();
    save("Hat", "crown#5.png", c);
  }

  // Party hat
  {
    const [c, ctx] = makeCanvas();
    triangle(ctx, 256, 30, 185, 140, 327, 140);
    ctx.fillStyle = "#FF6699";
    ctx.fill();
    ctx.strokeStyle = "#CC4477";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Stripes
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#FFCC33";
    for (let y = 50; y < 145; y += 22) {
      ctx.fillRect(170, y, 180, 8);
    }
    ctx.restore();
    // Re-stroke
    triangle(ctx, 256, 30, 185, 140, 327, 140);
    ctx.strokeStyle = "#CC4477";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Pompom
    circle(ctx, 256, 28, 10);
    ctx.fillStyle = "#FFCC33";
    ctx.fill();
    ctx.strokeStyle = "#CC9911";
    ctx.lineWidth = 2;
    ctx.stroke();
    save("Hat", "party_hat#15.png", c);
  }

  console.log("  Hat: 5 variants");
}

// ============================================================================
//  RUN
// ============================================================================

console.log("\nGenerating vector art layers...\n");
generateBGs();
generateShadows();
generateDogs();
generateEyes();
generateNoses();
generateMouths();
generateShirts();
generateNecklaces();
generateHats();
console.log("\nDone! All layer assets saved to layers/\n");
