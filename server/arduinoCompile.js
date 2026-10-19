
const express = require("express");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const router = express.Router();

// Arduino CLI installation on this laptop
const ARDUINO_CLI =
  "C:\\Program Files\\Arduino CLI\\arduino-cli.exe";

// Start with Arduino Uno
const BOARD = "arduino:avr:uno";

// Local prototype limits
const MAX_CODE_LENGTH = 12000;
const COMPILE_TIMEOUT = 60000;
const MAX_OUTPUT_LENGTH = 16000;

// Allow one compilation at a time
let compilationBusy = false;

function runArduinoCli(sketchFolder) {
  return new Promise((resolve) => {
    execFile(
      ARDUINO_CLI,
      [
        "compile",
        "--fqbn",
        BOARD,
        sketchFolder,
      ],
      {
        timeout: COMPILE_TIMEOUT,
        maxBuffer: 1024 * 1024,
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
          timedOut:
            Boolean(error) &&
            error.killed === true,
        });
      }
    );
  });
}

router.post("/compile/arduino", async (req, res) => {
  const code = req.body?.code;

  // Validate submitted code
  if (
    typeof code !== "string" ||
    !code.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: "Please enter some Arduino code.",
    });
  }

  if (code.length > MAX_CODE_LENGTH) {
    return res.status(400).json({
      success: false,
      error:
        "Your code is too large for this compilation test.",
    });
  }

  if (compilationBusy) {
    return res.status(429).json({
      success: false,
      error:
        "Another compilation is running. Please try again shortly.",
    });
  }

  compilationBusy = true;

  let temporaryFolder = null;

  try {
    // Create an isolated temporary workspace
    temporaryFolder = await fs.mkdtemp(
      path.join(os.tmpdir(), "circuitspark-")
    );

    const sketchFolder = path.join(
      temporaryFolder,
      "CircuitSparkSketch"
    );

    await fs.mkdir(sketchFolder);

    // Arduino requires the .ino filename to match
    // the containing sketch folder.
    const sketchFile = path.join(
      sketchFolder,
      "CircuitSparkSketch.ino"
    );

    await fs.writeFile(
      sketchFile,
      code,
      "utf8"
    );

    // Compile using Arduino CLI
    const result = await runArduinoCli(
      sketchFolder
    );

    return res.json({
      success: result.success,
      board: "Arduino Uno",
      output: result.output,
      error: result.timedOut
        ? "Compilation took too long."
        : null,
    });
  } catch (error) {
    console.error(
      "CircuitSpark compilation error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "CircuitSpark could not compile this sketch.",
    });
  } finally {
    // Remove temporary sketch files
    if (temporaryFolder) {
      try {
        await fs.rm(temporaryFolder, {
          recursive: true,
          force: true,
        });
      } catch (error) {
        console.error(
          "Temporary file cleanup error:",
          error
        );
      }
    }

    compilationBusy = false;
  }
});

module.exports = router;
