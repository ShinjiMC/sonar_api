// index.js
const { runFullAnalysis } = require("./src/services/analysis.runner");
const { processAndSaveMetrics } = require("./src/services/storage.service");
const { getGitInfo } = require("./src/services/git.service");
const { setupDatabase } = require("./src/services/database");

async function main() {
  const args = process.argv.slice(2);
  const projectPath = args[0];

  if (!projectPath) {
    console.error("Error: Debes pasar la ruta al proyecto.");
    console.error("Uso: node index.js /ruta/a/tu/proyecto/go");
    process.exit(1);
  }

  try {
    // 0. Asegurar DB lista
    setupDatabase();

    // 1. Obtener Info del Git (SHA, Author, Date)
    console.log("--- Paso 1: Extrayendo info de Git ---");
    const gitInfo = getGitInfo(projectPath);
    console.log(`Commit detectado: ${gitInfo.sha}`);

    // 2. Correr Análisis (Genera Data en Memoria)
    console.log("\n--- Paso 2: Ejecutando Análisis de Código ---");
    const analysisData = await runFullAnalysis(projectPath);

    // 3. Procesar, Agrupar e Insertar en SQLite
    console.log("\n--- Paso 3: Guardando en Base de Datos ---");
    await processAndSaveMetrics(gitInfo, analysisData);
  } catch (error) {
    console.error("❌ Error Fatal:", error);
    process.exit(1);
  }
}

main();
