// test.js
const { setupGoEnvironment } = require("./src/metrics/setup_go");
const { getHalsteadMetrics } = require("./src/metrics/halstead");
const { getCouplingMetrics } = require("./src/metrics/coupling");
const { getLayoutMetrics } = require("./src/metrics/layout");
const { getChurnMetrics } = require("./src/metrics/churn");
const fs = require("fs");
const { processSonarAnalysis } = require("./src/metrics/sonar.manager");
const path = require("path");
require("dotenv").config();

async function main() {
  // 1. Obtener argumentos de la línea de comandos
  const args = process.argv.slice(2);
  const projectPath = args[0];

  if (!projectPath) {
    console.error("Error: Debes pasar la ruta al proyecto.");
    console.error("Uso: node test.js /ruta/a/tu/proyecto/go");
    process.exit(1);
  }
  let startTime, endTime;
  try {
    await setupGoEnvironment(projectPath);
    startTime = Date.now();
    const data = await getHalsteadMetrics(projectPath);
    endTime = Date.now();

    console.log(
      `Tiempo de ejecución de getHalsteadMetrics: ${endTime - startTime} ms`
    );

    await fs.promises.writeFile(
      "halstead_metrics.json",
      JSON.stringify(data, null, 2)
    );

    startTime = Date.now();
    const data2 = await getCouplingMetrics(projectPath);
    endTime = Date.now();

    console.log(
      `Tiempo de ejecución de getCouplingMetrics: ${endTime - startTime} ms`
    );

    await fs.promises.writeFile(
      "coupling_metrics.json",
      JSON.stringify(data2, null, 2)
    );

    startTime = Date.now();
    const data3 = await getChurnMetrics(projectPath);
    endTime = Date.now();

    console.log(
      `Tiempo de ejecución de getChurnMetrics: ${endTime - startTime} ms`
    );

    await fs.promises.writeFile(
      "churn_metrics.json",
      JSON.stringify(data3, null, 2)
    );

    startTime = Date.now();
    const data4 = await getLayoutMetrics(projectPath);
    endTime = Date.now();

    console.log(
      `Tiempo de ejecución de getLayoutMetrics: ${endTime - startTime} ms`
    );

    await fs.promises.writeFile(
      "layout_metrics.json",
      JSON.stringify(data4, null, 2)
    );

    const SONAR_TOKEN = process.env.SONAR_TOKEN;
    const PROPS_PATH = path.resolve("sonar-project.properties");

    startTime = Date.now();
    const data5 = await processSonarAnalysis(
      projectPath,
      SONAR_TOKEN,
      PROPS_PATH
    );
    endTime = Date.now();

    console.log(
      `Tiempo de ejecución de processSonarAnalysis: ${endTime - startTime} ms`
    );

    await fs.writeFileSync(
      "sonar_metrics.json",
      JSON.stringify(data5, null, 2)
    );

    await console.log("✅ Setup completado exitosamente.");
  } catch (error) {
    console.error("\n❌ Error Fatal en el Setup:");
    console.error(error.message);
    process.exit(1);
  }
}

main();
