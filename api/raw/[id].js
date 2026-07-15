/**
 * Vercel Serverless Function: GET /api/raw/:id
 * Returns the raw content of a file stored in Firestore.
 */
export default async function handler(req, res) {
  const { id } = req.query;

  if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: "Invalid file ID." });
  }

  try {
    // Fetch from Firebase REST API (no Admin SDK needed)
    const projectId = "zeoxxyz";
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/publishedFiles/${id}`;

    const response = await fetch(url);

    if (response.status === 404) {
      return res.status(404).json({ error: "File not found." });
    }

    if (!response.ok) {
      throw new Error(`Firestore API returned ${response.status}`);
    }

    const data = await response.json();

    if (!data.fields) {
      return res.status(404).json({ error: "File not found." });
    }

    // Parse Firestore field types
    const fields = data.fields;
    const content   = fields.content?.stringValue   ?? "";
    const name      = fields.name?.stringValue       ?? "untitled";
    const encrypted = fields.encrypted?.booleanValue ?? false;
    const size      = parseInt(fields.size?.integerValue ?? fields.size?.doubleValue ?? "0");

    // Return as JSON for AJAX, or raw text when requested
    const accept = req.headers["accept"] || "";
    if (accept.includes("text/plain") || req.query.raw === "1") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(name)}"`);
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).send(content);
    }

    return res.status(200).json({
      id,
      name,
      content,
      size,
      encrypted,
    });
  } catch (err) {
    console.error("[/api/raw] Error:", err);
    return res.status(500).json({ error: "Failed to fetch file: " + err.message });
  }
}
