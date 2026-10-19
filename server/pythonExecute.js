
const express = require("express");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const router = express.Router();

// Python installation on this development laptop.
const PYTHON_PATH =
  "C:\\Users\\DELL\\AppData\\Local\\Programs\\Python\\Python315\\python.exe";

// Limits for our LOCAL development prototype.
const MAX_CODE_LENGTH = 12000;
const EXECUTION_TIMEOUT = 5000;
const MAX_OUTPUT_LENGTH = 16000;

let executionBusy = false;

function runPython(scriptPath, workingDirectory) {
  return new Promise((resolve) => {
    execFile(
      PYTHON_PATH,
      ["-I", "-S", "-B", scriptPath],
      {
        cwd: workingDirectory,
        timeout: EXECUTION_TIMEOUT,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const output = [stdout, stderr]
          .filter(Boolean)
          .join("\n")
          .slice(0, MAX_OUTPUT_LENGTH);

        resolve({
          success: !error,
          output,
          timedOut: Boolean(error?.killed),
          outputLimitReached:
            error?.code ===
            "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
        });
      }
    );
  });
}

router.post("/run/python", async (req, res) => {
  const code = req.body?.code;

  if (typeof code !== "string" || !code.trim()) {
    return res.status(400).json({
      success: false,
      error: "Please enter some Python code.",
    });
  }

  if (code.length > MAX_CODE_LENGTH) {
    return res.status(400).json({
      success: false,
      error:
        "Your Python code is too large for this execution test.",
    });
  }

  if (executionBusy) {
    return res.status(429).json({
      success: false,
      error:
        "Another Python program is running. Please try again shortly.",
    });
  }

  executionBusy = true;

  let temporaryFolder = null;

  try {
    temporaryFolder = await fs.mkdtemp(
      path.join(os.tmpdir(), "circuitspark-python-")
    );

    const scriptPath = path.join(
      temporaryFolder,
      "main.py"
    );

    await fs.writeFile(scriptPath, code, "utf8");

    const result = await runPython(
      scriptPath,
      temporaryFolder
    );

    return res.json({
      success: result.success,
      language: "Python",
      output: result.output,
      error: result.timedOut
        ? "Your program took too long and was stopped."
        : result.outputLimitReached
          ? "Your program produced too much output."
          : null,
    });
  } catch (error) {
    console.error(
      "CircuitSpark Python execution error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "CircuitSpark could not execute this Python program.",
    });
  } finally {
    if (temporaryFolder) {
      try {
        await fs.rm(temporaryFolder, {
          recursive: true,
          force: true,
        });
      } catch (error) {
        console.error(
          "Python temporary file cleanup error:",
          error
        );
      }
    }

    executionBusy = false;
  }
});

module.exports = router;
