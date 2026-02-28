import { fileURLToPath } from "node:url";

import { loadEnvironmentFile } from "./environment.js";
import { createApp } from "./app.js";

loadEnvironmentFile();

export function resolvePort(portValue: string | undefined): number {
  const parsedPort = Number(portValue);

  if (Number.isInteger(parsedPort) && parsedPort > 0) {
    return parsedPort;
  }

  return 3000;
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return fileURLToPath(import.meta.url) === process.argv[1];
}

if (isDirectExecution()) {
  const app = createApp();
  const port = resolvePort(process.env.PORT);

  app.listen(port, () => {
    console.log(`Restaurant hours API listening on port ${port}`);
  });
}
