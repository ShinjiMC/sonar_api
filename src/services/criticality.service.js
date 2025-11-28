// src/services/criticality.service.js
const { db } = require("./database");

// --- UMBRALES DE DENSIDAD (SonarQube Ratings) ---
// Referencia: https://docs.sonarsource.com/sonarqube/latest/user-guide/metric-definitions/
const DENSITY_THRESHOLDS = {
  // > 0.20 es Rating D/E en complejidad
  COMPLEXITY: { CRITICAL: 0.25, HIGH: 0.15, MEDIUM: 0.1 },
  // 1 issue cada 20 lineas (0.05) es critico
  ISSUES: { CRITICAL: 0.1, HIGH: 0.05, MEDIUM: 0.03 },
  // Imports excesivos
  COUPLING: { CRITICAL: 0.15, HIGH: 0.1, MEDIUM: 0.05 },
  // Alta volatilidad
  CHURN: { CRITICAL: 0.5, HIGH: 0.3, MEDIUM: 0.1 },
  // Riesgo de autoria
  AUTHORS: { CRITICAL: 0.1, HIGH: 0.05, MEDIUM: 0.02 },
  // Esfuerzo mental
  HALSTEAD: { CRITICAL: 80, HIGH: 50, MEDIUM: 30 },
};

function getDensitySeverity(value, loc, metricKey) {
  if (!loc || loc <= 0) return "LOW";
  if (!value) value = 0;

  const density = value / loc;
  const thresholds = DENSITY_THRESHOLDS[metricKey];

  if (density >= thresholds.CRITICAL) return "CRITICAL";
  if (density >= thresholds.HIGH) return "HIGH";
  if (density >= thresholds.MEDIUM) return "MEDIUM";
  return "LOW";
}

// --- MAPAS DE CONVERSIÓN (DEFINICIONES FALTANTES AGREGADAS) ---
const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, N_A: 0 };
const VALS_TO_SEVERITY = { 1: "LOW", 2: "MEDIUM", 3: "HIGH", 4: "CRITICAL" };
// ESTA ERA LA VARIABLE QUE FALTABA:
const SEVERITY_VALS = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

function getOverallSeverity(severities) {
  let maxSeverity = "LOW";
  for (const s of severities) {
    if (severityOrder[s] > severityOrder[maxSeverity]) {
      maxSeverity = s;
    }
  }
  return maxSeverity;
}

function calculateAndSaveFileCriticality(sha_id, fileNclocMap) {
  console.log(`Calculando CRITICIDAD (DENSIDAD) SHA: ${sha_id}`);

  const getMetricsStmt = db.prepare(`
    SELECT
      coh.file_path,
      coh.file_path AS path_key,
      COALESCE(chn.frequency, 0) AS raw_frequency,
      COALESCE(chn.authors, 0) AS raw_authors,
      COALESCE(cpx.total_complexity, 0) AS raw_complexity,
      COALESCE(cpl.num_dependency, 0) AS raw_coupling,
      COALESCE(lint.num_issues, 0) AS raw_issues,
      COALESCE(hal.volume, 0) AS raw_halstead_volume
    FROM tbl_cohesion AS coh
    LEFT JOIN tbl_churn AS chn ON coh.file_path = chn.file_path AND chn.sha_id = ?
    LEFT JOIN tbl_coupling AS cpl ON coh.file_path = cpl.file_path AND cpl.sha_id = ?
    LEFT JOIN tbl_lint_summary AS lint ON coh.file_path = lint.file_path AND lint.sha_id = ?
    LEFT JOIN tbl_halstead AS hal ON coh.file_path = hal.file_path AND hal.sha_id = ?
    LEFT JOIN (
      SELECT file_path, SUM(value) AS total_complexity
      FROM tbl_complexity WHERE sha_id = ? GROUP BY file_path
    ) AS cpx ON coh.file_path = cpx.file_path
    LEFT JOIN tbl_city_layout AS layout ON coh.file_path = layout.path AND layout.sha_id = ?
    WHERE coh.sha_id = ? 
    AND (layout.type IS NULL OR layout.type != 'STRUCT') 
  `);

  const filesMetrics = getMetricsStmt.all(
    sha_id,
    sha_id,
    sha_id,
    sha_id,
    sha_id,
    sha_id,
    sha_id
  );

  if (filesMetrics.length === 0) {
    console.log("No se encontraron métricas.");
    return;
  }

  const criticalityResults = filesMetrics.map((file) => {
    // Usar NCLOC de Sonar (mapa) o 0
    const loc = fileNclocMap ? fileNclocMap.get(file.path_key) || 0 : 0;

    const severities = [
      getDensitySeverity(file.raw_complexity, loc, "COMPLEXITY"),
      getDensitySeverity(file.raw_coupling, loc, "COUPLING"),
      getDensitySeverity(file.raw_issues, loc, "ISSUES"),
      getDensitySeverity(file.raw_frequency, loc, "CHURN"),
      getDensitySeverity(file.raw_authors, loc, "AUTHORS"),
      getDensitySeverity(file.raw_halstead_volume, loc, "HALSTEAD"),
    ];

    return {
      sha_id: sha_id,
      file_path: file.file_path,
      severity_complexity: severities[0],
      severity_coupling: severities[1],
      severity_issues: severities[2],
      severity_churn: severities[3],
      severity_authors: severities[4],
      severity_halstead: severities[5],
      overall_severity: getOverallSeverity(severities),
    };
  });

  const insertStmt = db.prepare(`
    INSERT INTO tbl_file_criticality (
      sha_id, file_path, severity_complexity, severity_coupling, severity_issues, 
      severity_churn, severity_authors, severity_halstead, overall_severity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sha_id, file_path) DO UPDATE SET
      severity_complexity = excluded.severity_complexity,
      severity_coupling = excluded.severity_coupling,
      severity_issues = excluded.severity_issues,
      severity_churn = excluded.severity_churn,
      severity_authors = excluded.severity_authors,
      severity_halstead = excluded.severity_halstead,
      overall_severity = excluded.overall_severity
  `);

  const tx = db.transaction((results) => {
    for (const r of results) {
      insertStmt.run(
        r.sha_id,
        r.file_path,
        r.severity_complexity,
        r.severity_coupling,
        r.severity_issues,
        r.severity_churn,
        r.severity_authors,
        r.severity_halstead,
        r.overall_severity
      );
    }
  });

  tx(criticalityResults);
  console.log(
    `Criticidad calculada para ${criticalityResults.length} archivos.`
  );
}

function calculateAndSaveFolderCriticality(sha_id) {
  console.log(
    `Calculando criticidad de carpetas (Bottom-Up) SHA ID: ${sha_id}`
  );

  const fileSeverityMap = new Map();
  const fileCoverageMap = new Map();
  const hierarchyMap = new Map();
  const folderStatsMap = new Map();
  const allFolderPaths = new Set();

  const filesCrit = db
    .prepare("SELECT * FROM tbl_file_criticality WHERE sha_id = ?")
    .all(sha_id);
  for (const f of filesCrit) fileSeverityMap.set(f.file_path, f);

  const filesCov = db
    .prepare(
      "SELECT file_path, percentage FROM tbl_coverage_summary WHERE sha_id = ?"
    )
    .all(sha_id);
  for (const f of filesCov) fileCoverageMap.set(f.file_path, f.percentage);

  const folders = db
    .prepare(
      "SELECT folder_path, children FROM tbl_folder_hierarchy WHERE sha_id = ?"
    )
    .all(sha_id);
  for (const f of folders) {
    let children = [];
    try {
      children = f.children ? JSON.parse(f.children) : [];
    } catch (e) {}
    hierarchyMap.set(f.folder_path, children);
    allFolderPaths.add(f.folder_path);
  }

  const getDepth = (p) => (p === "/" ? 0 : p.split("/").length);
  const sortedPaths = Array.from(allFolderPaths).sort(
    (a, b) => getDepth(b) - getDepth(a)
  );

  const metricsKeys = [
    "severity_complexity",
    "severity_coupling",
    "severity_issues",
    "severity_churn",
    "severity_authors",
    "severity_halstead",
    "overall_severity",
  ];
  const metricToDebtCol = {
    overall_severity: "overall",
    severity_complexity: "complexity",
    severity_coupling: "coupling",
    severity_issues: "issues",
    severity_churn: "churn",
    severity_authors: "authors",
    severity_halstead: "halstead",
  };

  for (const folderPath of sortedPaths) {
    const children = hierarchyMap.get(folderPath) || [];
    const currentStats = { maxSev: {}, debtValues: {} };
    const debtCollectors = {};

    metricsKeys.forEach((m) => {
      currentStats.maxSev[m] = 1; // LOW
      debtCollectors[m] = [];
    });

    for (const childName of children) {
      const childPath =
        folderPath === "/" ? childName : `${folderPath}/${childName}`;

      if (folderStatsMap.has(childPath)) {
        const childStats = folderStatsMap.get(childPath);
        metricsKeys.forEach((metric) => {
          const childSevVal = childStats.maxSev[metric];
          const debtKey = metricToDebtCol[metric];

          currentStats.maxSev[metric] = Math.max(
            currentStats.maxSev[metric],
            childSevVal
          );

          // Acumular Deuda si >= HIGH (3)
          if (childSevVal >= 3) {
            const val = childStats.debtValues[debtKey];
            if (val !== null && val !== undefined) {
              debtCollectors[metric].push(val);
            }
          }
        });
      } else if (fileSeverityMap.has(childPath)) {
        const fSev = fileSeverityMap.get(childPath);
        const fCov = fileCoverageMap.get(childPath) || 0;

        metricsKeys.forEach((metric) => {
          const val = SEVERITY_VALS[fSev[metric]] || 1;
          currentStats.maxSev[metric] = Math.max(
            currentStats.maxSev[metric],
            val
          );

          if (val >= 3) {
            if (fCov !== -1) {
              debtCollectors[metric].push(fCov);
            }
          }
        });
      }
    }

    metricsKeys.forEach((metric) => {
      const debtKey = metricToDebtCol[metric];
      const values = debtCollectors[metric];
      if (values.length > 0) {
        const sum = values.reduce((acc, v) => acc + v, 0);
        currentStats.debtValues[debtKey] = sum / values.length;
      } else {
        currentStats.debtValues[debtKey] = null;
      }
    });

    folderStatsMap.set(folderPath, currentStats);
  }

  const updateStmt = db.prepare(`
    UPDATE tbl_folder_metrics SET 
      severity_complexity = ?, severity_coupling = ?, severity_issues = ?,
      severity_churn = ?, severity_authors = ?, severity_halstead = ?,
      overall_severity = ?,
      debt_cov_overall = ?, debt_cov_complexity = ?, debt_cov_coupling = ?,
      debt_cov_issues = ?, debt_cov_churn = ?, debt_cov_authors = ?,
      debt_cov_halstead = ?
    WHERE sha_id = ? AND folder_path = ?
  `);

  const updateTx = db.transaction(() => {
    for (const [folderPath, stats] of folderStatsMap.entries()) {
      updateStmt.run(
        VALS_TO_SEVERITY[stats.maxSev.severity_complexity],
        VALS_TO_SEVERITY[stats.maxSev.severity_coupling],
        VALS_TO_SEVERITY[stats.maxSev.severity_issues],
        VALS_TO_SEVERITY[stats.maxSev.severity_churn],
        VALS_TO_SEVERITY[stats.maxSev.severity_authors],
        VALS_TO_SEVERITY[stats.maxSev.severity_halstead],
        VALS_TO_SEVERITY[stats.maxSev.overall_severity],
        stats.debtValues["overall"],
        stats.debtValues["complexity"],
        stats.debtValues["coupling"],
        stats.debtValues["issues"],
        stats.debtValues["churn"],
        stats.debtValues["authors"],
        stats.debtValues["halstead"],
        sha_id,
        folderPath
      );
    }
  });

  updateTx();
  console.log(
    `Métricas de carpeta guardadas correctamente (${folderStatsMap.size}).`
  );
}

module.exports = {
  calculateAndSaveFileCriticality,
  calculateAndSaveFolderCriticality,
};
