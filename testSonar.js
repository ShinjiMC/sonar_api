const { processSonarAnalysis } = require("./src/metrics/sonar.manager");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Uso: node testSonar.js <ruta_repo>");
    process.exit(1);
  }

  const REPO_PATH = path.resolve(args[0]);
  const SONAR_TOKEN = process.env.SONAR_TOKEN;
  const PROPS_PATH = path.resolve("sonar-project.properties");

  try {
    const data = await processSonarAnalysis(REPO_PATH, SONAR_TOKEN, PROPS_PATH);
    fs.writeFileSync("sonar_metrics.json", JSON.stringify(data, null, 2));

    console.log("🚀 Proceso completado. Resultados en sonar_metrics.json");
  } catch (error) {
    console.error("❌ Error Fatal:", error.message);
  }
}

main();
