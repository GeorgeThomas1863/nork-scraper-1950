/**
 * Ultimate UserPromptSubmit Hook for Claude Code (JavaScript ESM Port)
 * Original Python version ported to Node.js ESM with zero dependencie. [Requires type: module in package.json]
 *
 * Features:
 * - McKay's ultrathink flag (-u) for maximum thinking
 * - Engineering standards auto-applied for substantial work
 * - 18 different flags for various development modes
 * - Self-documenting with -hh flag
 * - Comprehensive logging to ~/.claude/logs/
 */

import { readFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

// Configuration
const ENABLE_LOGGING = true;
const LOG_DIR = join(homedir(), ".claude", "logs");
const ENGINEER_NAME = process.env.USER || "Engineer";

// ---------------------------------------------------------------------------
// PromptEnhancer
// ---------------------------------------------------------------------------

class PromptEnhancer {
  constructor() {
    const now = new Date();
    this.contexts = [];
    this.logData = {
      timestamp: now.toISOString(),
      formatted_date: formatDate(now),
    };
  }

  addContext(context) {
    if (context && context.trim()) {
      this.contexts.push(context.trim());
    }
  }

  logEvent(key, value) {
    this.logData[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Flag Handlers
// ---------------------------------------------------------------------------

const FlagHandlers = {
  ultrathink() {
    return (
      "\n\nUse the maximum amount of ultrathink. Take all the time you need. " +
      "It's much better if you do too much research and thinking than not enough."
    );
  },

  engineering_standards() {
    return `

Follow the project's principal engineering standards. No shortcuts, stubs, or hardcoded values. We build it right the first time: clean, robust, and production ready. No halfway measures.

Keep it tight. Use the simplest solution that meets the need with high quality. Do not overengineer. Do not create new files, layers, or abstractions unless they are clearly necessary. Every line of code should earn its place. Simplicity is earned through understanding, not guesswork.

Make it clean. Make it count.

If you encounter uncertainty, lack context, or are not confident in the solution, stop. Do not guess or make things up. It is not only okay, it is expected, to ask for clarification or help. Excellence includes knowing when to pause.`;
  },

  think_hard() {
    return "\n\nThink hard about this problem. Consider multiple approaches and evaluate trade-offs before implementing.";
  },

  think() {
    return "\n\nThink step by step through this problem before implementing.";
  },

  plan() {
    return "\n\nCreate a detailed plan before starting implementation. Break down the task into clear steps and identify potential challenges.";
  },

  verbose() {
    return "\n\nBe verbose in your explanations. Include detailed comments explaining the why behind decisions, not just the what.";
  },

  security() {
    return "\n\nFocus on security best practices. Consider potential vulnerabilities, input validation, authentication, and data protection.";
  },

  test() {
    return "\n\nInclude comprehensive unit tests for all functionality. Follow TDD principles where appropriate. Tests should be clear, focused, and cover edge cases.";
  },

  doc() {
    return "\n\nProvide detailed documentation with examples. Include docstrings, type hints, and usage examples. Documentation should be clear to someone unfamiliar with the codebase.";
  },

  perf() {
    return "\n\nOptimize for performance. Consider algorithmic complexity, memory usage, and potential bottlenecks. Include benchmarks where relevant.";
  },

  review() {
    return "\n\nReview this code critically. Look for bugs, code smells, performance issues, security vulnerabilities, and suggest improvements. Be thorough but constructive.";
  },

  refactor() {
    return "\n\nRefactor for clarity and maintainability. Improve naming, reduce complexity, eliminate duplication, and enhance readability without changing functionality.";
  },

  research() {
    return "\n\nConduct internet research of the problem to identify the best solution to the problem. Use the appropriate tools and plugins to help you with the research. Only use sites that are trusted and use https or other secure protocols.";
  },

  debug() {
    return "\n\nDebug systematically. Add logging, check assumptions, trace execution flow, and identify the root cause before proposing fixes.";
  },

  api() {
    return "\n\nFollow REST/GraphQL best practices. Design clear, consistent, and well-documented APIs. Consider versioning, error handling, and client developer experience.";
  },

  clean() {
    return "\n\nApply clean code principles: meaningful names, small functions, single responsibility, DRY, and SOLID principles. Code should be self-documenting.";
  },

  no_guess() {
    return "\n\nDo not guess or make assumptions. If something is unclear or you lack necessary context, stop and ask for clarification. It's better to ask than to implement incorrectly.";
  },

  context() {
    const contexts = [];

    // Python ecosystem
    const pythonFiles = ["pyproject.toml", "setup.py", "requirements.txt", "environment.yml"];
    const pythonTools = {
      "uv.lock": "uv",
      "poetry.lock": "Poetry",
      "Pipfile.lock": "Pipenv",
      ".venv": "venv",
      "conda-meta": "Conda",
    };

    const foundPython = pythonFiles.some((f) => existsSync(f));
    if (foundPython) {
      const tools = [];
      for (const [file, tool] of Object.entries(pythonTools)) {
        if (existsSync(file)) {
          tools.push(tool);
        }
      }
      if (tools.length) {
        contexts.push(`Python (${tools.join(", ")})`);
      } else {
        contexts.push("Python");
      }
    }

    // Node.js ecosystem
    if (existsSync("package.json")) {
      if (existsSync("yarn.lock")) {
        contexts.push("Node.js (Yarn)");
      } else if (existsSync("pnpm-lock.yaml")) {
        contexts.push("Node.js (pnpm)");
      } else if (existsSync("bun.lockb")) {
        contexts.push("Node.js (Bun)");
      } else {
        contexts.push("Node.js (npm)");
      }
    }

    // Other ecosystems
    const ecosystems = {
      "Cargo.toml": "Rust",
      "go.mod": "Go",
      "pom.xml": "Java (Maven)",
      "build.gradle": "Java (Gradle)",
      Gemfile: "Ruby",
      "composer.json": "PHP",
      "mix.exs": "Elixir",
      "project.clj": "Clojure",
    };

    for (const [file, ecosystem] of Object.entries(ecosystems)) {
      if (existsSync(file)) {
        contexts.push(ecosystem);
      }
    }

    if (contexts.length) {
      return `\n\n[Project Context: ${contexts.join(", ")}]`;
    }
    return "";
  },

  help() {
    return `

The user has just asked for help understanding the UserPromptSubmit hooks. Please display the following help message:
Here are all available UserPromptSubmit hook flags:

🧠 THINKING MODES
- -u, -ultrathink    Maximum thinking budget (31,999 tokens) for complex problems
- -th, -think_hard   Enhanced thinking for challenging tasks
- -t, -think         Step-by-step thinking for standard problems

🏗️ QUALITY & STANDARDS
- -e, -eng, -standards    Apply engineering standards (no shortcuts, production-ready)
- -clean                  Follow clean code principles (SOLID, DRY, meaningful names)

💻 DEVELOPMENT MODES
- -p, -plan          Create detailed plan before implementation
- -v, -verbose       Include verbose explanations and detailed comments
- -s, -sec, -security    Focus on security best practices
- -test              Include comprehensive unit tests
- -doc               Provide detailed documentation with examples
- -perf              Optimize for performance with benchmarks
- -review            Critical code review mode
- -refactor          Refactor for clarity and maintainability
- -debug             Systematic debugging approach
- -api               API design best practices
- -r, -research      Conduct internet research of the problem and the solution to the problem

🔧 OTHER OPTIONS
- -ng, -no_guess     Never guess; ask for clarification instead
- -ctx, -context     Include project context (package managers, tools)
- -hh, -hhelp        Show this help message

💡 COMMON COMBINATIONS
Complex problem:     -u -p        (ultrathink + plan)
Production feature:  -e -test -doc (standards + tests + docs)
Code review:        -review -u    (review + deep thinking)
Quick fix:          (no flags - skips engineering standards)
Debug issue:        -debug -v -u  (debug + verbose + ultrathink)

Note: Engineering standards (-e) are auto-applied for substantial work unless you're asking simple questions.`;
  },
};

// ---------------------------------------------------------------------------
// Flag mapping
// ---------------------------------------------------------------------------

const FLAG_MAPPING = {
  // Thinking modes
  u: FlagHandlers.ultrathink,
  ultrathink: FlagHandlers.ultrathink,
  th: FlagHandlers.think_hard,
  think_hard: FlagHandlers.think_hard,
  t: FlagHandlers.think,
  think: FlagHandlers.think,
  // Quality modes
  e: FlagHandlers.engineering_standards,
  eng: FlagHandlers.engineering_standards,
  standards: FlagHandlers.engineering_standards,
  clean: FlagHandlers.clean,
  // Development modes
  p: FlagHandlers.plan,
  plan: FlagHandlers.plan,
  v: FlagHandlers.verbose,
  verbose: FlagHandlers.verbose,
  s: FlagHandlers.security,
  sec: FlagHandlers.security,
  test: FlagHandlers.test,
  doc: FlagHandlers.doc,
  perf: FlagHandlers.perf,
  review: FlagHandlers.review,
  refactor: FlagHandlers.refactor,
  debug: FlagHandlers.debug,
  api: FlagHandlers.api,
  no_guess: FlagHandlers.no_guess,
  ng: FlagHandlers.no_guess,
  r: FlagHandlers.research,
  research: FlagHandlers.research,
  // Context
  ctx: FlagHandlers.context,
  context: FlagHandlers.context,
  // Help
  hh: FlagHandlers.help,
  hhelp: FlagHandlers.help,
};

// ---------------------------------------------------------------------------
// Context Injectors
// ---------------------------------------------------------------------------

function getGitInfo() {
  try {
    const branch = execSync("git branch --show-current", {
      stdio: ["pipe", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (branch) {
      return `\n[Git Branch: ${branch}]`;
    }
  } catch (_) {
    // Not a git repo or git not installed
  }
  return "";
}

function getCurrentDate() {
  return `\n[Current Date: ${formatDate(new Date())}]`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date) {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function parseFlags(prompt) {
  const flags = [];
  let cleanPrompt = prompt;

  // Check for flags at the end: "fix the bug -u -debug"
  const endPattern = /((?:\s+)-[a-zA-Z_]+)+$/;
  const endMatch = cleanPrompt.match(endPattern);
  if (endMatch) {
    const flagRe = /-([a-zA-Z_]+)/g;
    let m;
    while ((m = flagRe.exec(endMatch[0])) !== null) {
      flags.push(m[1]);
    }
    cleanPrompt = cleanPrompt.slice(0, endMatch.index).trimEnd();
  }

  // Check for flags at the beginning: "-u -debug fix the bug"
  const startPattern = /^(-[a-zA-Z_]+(?:\s+-[a-zA-Z_]+)*)(?:\s+|$)/;
  const startMatch = cleanPrompt.match(startPattern);
  if (startMatch) {
    const flagRe = /-([a-zA-Z_]+)/g;
    let m;
    while ((m = flagRe.exec(startMatch[1])) !== null) {
      // Avoid duplicates if same flag used at both ends
      if (!flags.includes(m[1])) {
        flags.push(m[1]);
      }
    }
    cleanPrompt = cleanPrompt.slice(startMatch[0].length).trimStart();
  }

  return [cleanPrompt, flags];
}

function shouldApplyDefaults(prompt) {
  const skipPatterns = [
    /^(ls|dir|pwd|cd|cat|grep|find|which|what|where|who|when|how much|how many)\b/i,
    /^(show|list|display|get|fetch)\s+(me\s+)?(the\s+)?/i,
    /^\?/,
    /^(hi|hello|hey|thanks|thank you|bye)/i,
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(prompt)) {
      return false;
    }
  }

  return true;
}

function writeLog(enhancer) {
  if (!ENABLE_LOGGING) return;

  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const logFile = join(LOG_DIR, "prompt_hooks.jsonl");
    appendFileSync(logFile, JSON.stringify(enhancer.logData) + "\n");
  } catch (_) {
    // Silently fail logging
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export const main = () => {
  try {
    const raw = readFileSync(process.stdin.fd, "utf8");
    const inputData = JSON.parse(raw);
    const prompt = inputData.prompt || "";
    const sessionId = inputData.session_id || "unknown";

    const enhancer = new PromptEnhancer();
    enhancer.logEvent("original_prompt", prompt);
    enhancer.logEvent("session_id", sessionId);

    // Handle bare "hh" without dash (for CLI-friendly help)
    if (prompt.trim().toLowerCase() === "hh") {
      enhancer.addContext(getCurrentDate());
      enhancer.addContext(FlagHandlers.help());
      enhancer.logEvent("flags", ["hh"]);
      enhancer.logEvent("clean_prompt", "");
      enhancer.logEvent("help_request", true);
      enhancer.logEvent("applied_flags", ["hh"]);
      if (enhancer.contexts.length) {
        process.stdout.write(enhancer.contexts.join("\n"));
        enhancer.logEvent("injected_context", enhancer.contexts.join("\n"));
      }
      writeLog(enhancer);
      process.exit(0);
    }

    // Parse flags
    let [cleanPrompt, flags] = parseFlags(prompt);
    enhancer.logEvent("flags", flags);
    enhancer.logEvent("clean_prompt", cleanPrompt);

    // Special handling for help flag alone
    if (cleanPrompt.trim() === "" && (flags.includes("hh") || flags.includes("hhelp"))) {
      cleanPrompt = "Show available hook flags";
      enhancer.logEvent("help_request", true);
    }

    // Add minimal but useful context injections
    enhancer.addContext(getCurrentDate());
    const gitInfo = getGitInfo();
    if (gitInfo) {
      enhancer.addContext(gitInfo);
    }

    // Apply default engineering standards if appropriate
    if (!flags.includes("hh") && !flags.includes("hhelp")) {
      if (shouldApplyDefaults(cleanPrompt) && !flags.includes("e") && !flags.includes("eng")) {
        enhancer.addContext(FlagHandlers.engineering_standards());
        enhancer.logEvent("auto_applied_standards", true);
      }
    }

    // Process explicit flags
    const appliedFlags = [];
    for (const flag of flags) {
      const handler = FLAG_MAPPING[flag.toLowerCase()];
      if (handler) {
        enhancer.addContext(handler());
        appliedFlags.push(flag);
      }
    }
    enhancer.logEvent("applied_flags", appliedFlags);

    // Output combined context
    if (enhancer.contexts.length) {
      const output = enhancer.contexts.join("\n");
      process.stdout.write(output);
      enhancer.logEvent("injected_context", output);
    }

    // Write log
    writeLog(enhancer);

    process.exit(0);
  } catch (e) {
    process.stderr.write(`[Hook Error: ${e.message}]\n`);
    process.exit(1);
  }
};

main();
