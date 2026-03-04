const basePath = process.cwd();
const { startCreating, buildSetup } = require(`${basePath}/src/engine.js`);

(async () => {
  console.log("\n--- NFT Generation Starting ---\n");
  buildSetup();
  await startCreating();
  console.log("--- Generation Complete ---\n");
})();
