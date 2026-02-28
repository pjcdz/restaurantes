import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

export function loadEnvironmentFile() {
  const environmentFilePath = resolvePath(process.cwd(), ".env");

  if (!existsSync(environmentFilePath)) {
    return;
  }

  const fileContents = readFileSync(environmentFilePath, "utf8");

  for (const rawLine of fileContents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key || !value || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value;
  }
}
