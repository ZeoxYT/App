import type { VercelRequest, VercelResponse } from "@vercel/node";

import { validate } from "../src/compiler/LuauCompiler.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { code } = req.body as { code: unknown };

    if (typeof code !== "string") {
      return res.status(400).json({ error: "Invalid 'code' parameter" });
    }

    const result = validate(code);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[API-ERROR] /api/validate failed:", err);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
