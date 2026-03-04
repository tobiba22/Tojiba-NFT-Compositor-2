const basePath = process.cwd();
const fs = require("fs");

const buildDir = `${basePath}/build`;
const metadataPath = `${buildDir}/json/_metadata.json`;

if (!fs.existsSync(metadataPath)) {
  console.error("No _metadata.json found. Run generation first.");
  process.exit(1);
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
const total = metadata.length;
const traitMap = {};

metadata.forEach((item) => {
  item.attributes.forEach((attr) => {
    if (!traitMap[attr.trait_type]) traitMap[attr.trait_type] = {};
    traitMap[attr.trait_type][attr.value] =
      (traitMap[attr.trait_type][attr.value] || 0) + 1;
  });
});

console.log(`\nCollection size: ${total}\n`);

for (const [layer, traits] of Object.entries(traitMap)) {
  console.log(`${layer}:`);
  const sorted = Object.entries(traits).sort((a, b) => b[1] - a[1]);
  for (const [trait, count] of sorted) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`  ${trait}: ${count} (${pct}%)`);
  }
  console.log();
}
