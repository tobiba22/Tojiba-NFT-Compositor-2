const basePath = process.cwd();
const appDir = process.env.APP_DIR || basePath;
const { startCreating, buildSetup } = require(`${appDir}/src/engine.js`);

(async () => {
  console.log("\n--- NFT Generation Starting ---\n");
  buildSetup();
  await startCreating();
  console.log("--- Generation Complete ---\n");
})();
