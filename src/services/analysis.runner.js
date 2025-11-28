// src/services/analysis.runner.js
const { setupGoEnvironment } = require("../metrics/setup_go");
const { getHalsteadMetrics } = require("../metrics/halstead");
const { getCouplingMetrics } = require("../metrics/coupling");
const { getLayoutMetrics } = require("../metrics/layout");
const { getChurnMetrics } = require("../metrics/churn");
const { processSonarAnalysis } = require("../metrics/sonar.manager");
const path = require("path");
require("dotenv").config();

async function runFullAnalysis(projectPath) {
  console.log("🚀 Iniciando Análisis Completo en memoria...");
  const results = {};

  try {
    await setupGoEnvironment(projectPath);
    console.log("Ejecutando Halstead...");
    results.halstead = await getHalsteadMetrics(projectPath);
    console.log("Ejecutando Coupling...");
    results.coupling = await getCouplingMetrics(projectPath);
    console.log("Ejecutando Churn...");
    results.churn = await getChurnMetrics(projectPath);
    console.log("Ejecutando Layout...");
    results.layout = await getLayoutMetrics(projectPath);
    const SONAR_TOKEN = process.env.SONAR_TOKEN;
    const PROPS_PATH = path.resolve("sonar-project.properties");
    console.log("Ejecutando Sonar Analysis...");
    results.sonar = await processSonarAnalysis(
      projectPath,
      SONAR_TOKEN,
      PROPS_PATH
    );
    console.log("✅ Análisis completado. Retornando datos...");
    return results;
  } catch (error) {
    console.error("❌ Error durante el análisis:", error);
    throw error;
  }
}

module.exports = { runFullAnalysis };
