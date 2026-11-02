# CircuitSpark ⚡

### Curious minds. Bright ideas. Real inventions.

**An AI learning companion for people who want to understand electronics and embedded systems—not just copy code or follow a circuit diagram.**

CircuitSpark combines a conversational AI tutor with a practical coding workspace. It is intended to help curious learners, including people without physical electronics equipment, ask questions, understand why things work, and practise their skills.

> **Status:** Active prototype built during Hacktoberfest 2026. Some Code Lab features are experimental. A verified live demo URL has not yet been added.

## The problem

Getting started with embedded systems can feel expensive and intimidating. Beginners encounter unfamiliar terminology and tutorials that show *what to do* without explaining *why*. CircuitSpark starts with curiosity rather than equipment: a learner can ask about pins, sensors, voltage, or code before owning an Arduino.

## Our approach: teach the reasoning

CircuitSpark's tutor is designed to explain before questioning, offer progressive hints when appropriate, respond directly when asked, and avoid assuming every learner has the same experience or hardware. It generates explanations dynamically rather than relying on a manually maintained curriculum.

Crucially, it distinguishes code compilation from execution, simulated behaviour from physical circuits, and assumptions from verified specifications. This is a design goal—not a claim that every AI response is correct.

## What you can do

### AI Tutor

- Ask about electronics, microcontrollers, programming, robotics, and related engineering topics.
- Work through concepts and practical problems with explanations adapted to the conversation.
- Receive streaming responses.
- Save, reopen, rename, and delete conversations in browser storage.
- Copy and edit messages, regenerate replies, and retry interrupted responses.
- Read Markdown-formatted explanations and code.

### Code Lab

- Write Arduino sketches or Python code in syntax-highlighted CodeMirror editors.
- Create and switch between multiple projects, saved in your browser.
- Ask the AI tutor questions while coding.
- Explore **experimental** Arduino Uno compilation using an AVR-GCC WebAssembly integration. Compilation is **not** a circuit simulation or execution on hardware.
- Use the optional Python execution route **only in trusted local development**; it is not available on the production backend.

An older interactive LED lesson component remains in the source tree but is **not accessible through the current main navigation** and is therefore not presented here as a live feature.

## How the tutor works

```text
React frontend (AI Tutor / Code Lab)
              |
          POST /api/chat
              |
        Express backend
        | system teaching prompt
        | recent conversation context
        | rate limits + protected API key
              |
       Ollama Cloud API
         gemma4:31b
              |
       streamed explanation
```

The current backend uses **Ollama Cloud** with `gemma4:31b`. The root [Modelfile](Modelfile) records an earlier local **Ollama + `qwen3:4b`** tutor experiment. This local model is not an automatic fallback for the cloud backend.

## Stack

| Layer | Technology |
| --- | --- |
| Interface | React, TypeScript, Vite, CSS |
| Code editor | CodeMirror |
| Backend | Node.js, Express |
| AI | Ollama Cloud (`gemma4:31b`); local Ollama experiment (`qwen3:4b`) |
| Arduino compilation | `@horang-corp/avr-gcc-wasm` |
| Rich text | React Markdown, remark-gfm |
| Browser persistence | `localStorage` |

## Running locally

**Requirements:** Git, a Node.js version compatible with Vite 8 (Node 24 is a suitable choice), npm, and an Ollama Cloud API key to use the tutor.

### 1. Clone and install

```bash
git clone https://github.com/derin-03/CircuitSpark.git
cd CircuitSpark
npm install
cd server
npm install
```

### 2. Start the backend

The server reads the `OLLAMA_API_KEY` environment variable directly. It does **not** automatically load a `.env` file.

Windows PowerShell (inside the `server` directory):

```powershell
$env:OLLAMA_API_KEY="replace-with-your-own-key"
node index.js
```

macOS / Linux (inside `server`):

```bash
export OLLAMA_API_KEY="replace-with-your-own-key"
node index.js
```

These are **placeholders**, not real credentials. Never commit secrets or put `OLLAMA_API_KEY` in a frontend variable prefixed with `VITE_`.

The API defaults to `http://127.0.0.1:3001`.

### 3. Start the frontend

In a second terminal, from the repository root:

```bash
npm run dev
```

Open the address printed by Vite (normally `http://localhost:5173`). To change the backend URL, create a **root-level** `.env.local` file containing:

```env
VITE_API_BASE_URL=http://127.0.0.1:3001
```

Restart Vite after changing the variable.

### 4. Run available checks

```bash
npm run build
npm run lint
```

These are frontend build and lint checks, not a full AI safety or integration test suite.

### Optional local tutor

With Ollama installed, run this from the repository root:

```bash
ollama create circuitspark -f Modelfile
```

This creates the earlier `qwen3:4b`-based local tutor; it does **not** switch the web app away from its current cloud backend.

## Project structure

```text
CircuitSpark/
├── src/
│   ├── App.tsx               # Home and workspace navigation
│   ├── Tutor.tsx             # AI conversations
│   ├── CodeLab.tsx           # Arduino/Python workspace
│   ├── api.ts                # Frontend API URL
│   └── arduinoPreprocess.ts  # Arduino sketch preprocessing
├── server/
│   ├── index.js              # Express API + cloud AI streaming
│   ├── pythonExecute.js      # Optional local Python runner
│   └── arduinoCompile.js
├── Evaluation/
│   └── circuitspark-tests.md # AI tutor evaluation notes
├── Modelfile                 # Local Ollama tutor configuration
└── README.md
```

## Known limitations

- **AI advice needs verification.** The [evaluation record](Evaluation/circuitspark-tests.md) documents early local-model failures involving resistor explanations and unverified simulator claims, with several test cases still pending. These tests do not establish the reliability of the current cloud model.
- **Arduino compilation is experimental.** The browser compiler expects WebAssembly toolchain assets at `/avr/`, but those assets are not currently checked into the repository. The compiler may not work until they are supplied correctly.
- **Python execution is not a secure sandbox.** The backend mounts `/api/run/python` only outside production when `CIRCUITSPARK_LOCAL_EXECUTION=enabled`. The runner uses a developer-specific Python executable path. Do not expose it to untrusted users.
- **No cross-device sync.** Chats and projects live in browser storage and may disappear if site data is cleared.
- **Cloud dependence.** Tutor responses require network access, Ollama Cloud availability, and available request allowance.
- **Hardware safety matters.** Verify electrical ratings, current limiting, polarity, and physical connections against reliable technical references before building a real circuit.

## Contributing

CircuitSpark started during Hacktoberfest 2026. Feedback, bug reports, documentation updates, accessibility improvements, safer explanations, and tests are welcome.

Review [issues](https://github.com/derin-03/CircuitSpark/issues) or open a new issue to discuss a change. Keep pull requests focused, explain what changed, and include reproducible testing steps. Never submit credentials or unsafe hardware instructions.

## License status

**A repository-wide `LICENSE` file has not yet been added.** Being publicly visible on GitHub does not automatically grant permission to reuse or redistribute the code. The `ISC` field inside `server/package.json` does not establish a license for the entire repository.

## Creator

Created by [derin-03](https://github.com/derin-03) as an exploration of AI and embedded systems education.

**The idea:** You should be able to begin learning how things work before you can afford to build them.

---

*Ask questions. Try things. Figure it out.*
