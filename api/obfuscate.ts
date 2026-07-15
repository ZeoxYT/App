import type { VercelRequest, VercelResponse } from "@vercel/node";

import { lex } from "../src/lexer/Lexer.js";
import { parse } from "../src/parser/Parser.js";
import { obfuscate } from "../src/obfuscator/Obfuscator.js";
import { encodeStrings } from "../src/obfuscator/StringEncoder.js";
import { scrambleControlFlow } from "../src/obfuscator/ControlFlowScrambler.js";
import { printChunk, printChunkOneLine } from "../src/obfuscator/Printer.js";
import { compile } from "../src/vm/Compiler.js";
import { regCompile } from "../src/vm/RegCompiler.js";
import { generateVM } from "../src/vm/vm-gen.js";
import { generateRegVM } from "../src/vm/reg-vm-gen.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { code, options } = req.body as {
      code: unknown;
      options?: Record<string, unknown>;
    };

    if (typeof code !== "string") {
      return res.status(400).json({ error: "Invalid 'code' parameter" });
    }

    const opts = options || {};
    const noRename       = opts.noRename       === true;
    const noPreserve     = opts.noPreserve     === true;
    const encodeStringsOpt = opts.encodeStrings === true;
    const scrambleOpt    = opts.scramble        === true;
    const oneLineOpt     = opts.oneLine         === true;
    const vmType         = (opts.vmType  as string) || "none";
    const vmLevel        = (opts.vmLevel as string) || "normal";

    const { tokens, errors: lexErrors } = lex(code);
    if (lexErrors.length > 0) {
      return res.status(400).json({ error: "Lexer error", details: lexErrors });
    }

    let ast = parse(tokens);

    if (encodeStringsOpt) {
      ast = encodeStrings(ast, { enabled: true });
    }
    if (scrambleOpt) {
      ast = scrambleControlFlow(ast, { enabled: true });
    }

    let output: string;

    if (vmType === "stack") {
      const obfuscated = obfuscate(ast, {
        renameLocals:     !noRename,
        preserveGlobals:  !noPreserve,
      });
      const chunk = compile(obfuscated);
      output = generateVM(chunk, {
        level:            vmLevel as any,
        executorGlobals:  vmLevel !== "debug",
      });
    } else if (vmType === "register") {
      const obfuscated = obfuscate(ast, {
        renameLocals:     !noRename,
        preserveGlobals:  !noPreserve,
      });
      const chunk = regCompile(obfuscated);
      const disableFeatures: string[] = [];
      if (vmLevel === "debug") disableFeatures.push("controlFlowFlattening");
      output = generateRegVM(chunk, {
        level:             vmLevel as any,
        executorGlobals:   vmLevel !== "debug",
        polymorphicSeed:   Date.now(),
        disableFeatures:   disableFeatures as any[],
      });
    } else {
      const obfuscated = obfuscate(ast, {
        renameLocals:     !noRename,
        preserveGlobals:  !noPreserve,
      });
      output = oneLineOpt ? printChunkOneLine(obfuscated) : printChunk(obfuscated);
    }

    return res.status(200).json({ output });
  } catch (err: any) {
    console.error("Obfuscation error:", err);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
