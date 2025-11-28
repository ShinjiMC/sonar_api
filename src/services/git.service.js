const { execSync } = require("child_process");

function getGitInfo(projectPath) {
  try {
    const options = { cwd: projectPath, encoding: "utf8" };
    const sha = execSync("git rev-parse HEAD", options).trim();
    const author = execSync("git log -1 --pretty=format:'%an'", options).trim();
    const date = execSync("git log -1 --format=%cd --date=iso", options).trim();
    const message = execSync("git log -1 --pretty=format:'%s'", options).trim();
    return { sha, author, date, message };
  } catch (error) {
    console.error("Error obteniendo datos de git:", error.message);
    return {
      sha: `unknown-${Date.now()}`,
      author: "Unknown",
      date: new Date().toISOString(),
      message: "No git info available",
    };
  }
}

module.exports = { getGitInfo };
