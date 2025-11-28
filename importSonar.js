const { setupDatabase } = require("./src/config/database");
const { runSonarPipeline } = require("./src/services/sonar.pipeline");

async function main() {
  try {
    setupDatabase(); // Crea tablas si no existen
    await runSonarPipeline(); // Corre proceso
  } catch (error) {
    console.error("Error Fatal:", error);
    process.exit(1);
  }
}

main();
