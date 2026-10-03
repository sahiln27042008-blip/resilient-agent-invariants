// Anti-pattern: an untrusted script runs on the main event loop.
import { exec } from "child_process";

export function runScript(script: string) {
  exec(`node -e "${script}"`, (err, stdout) => {
    console.log(err ?? stdout);
  });
}
