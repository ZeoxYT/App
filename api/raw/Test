// Vercel Serverless Function: GET /api/raw/:id
// Fetches a published file from Firestore REST API and returns decrypted content.

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(400).send("-- Error: Missing file ID");
  }

  const projectId = "zeoxxyz";
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/publishedFiles/${id}`;

  try {
    const response = await fetch(firestoreUrl);

    if (response.status === 404) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res
        .status(404)
        .send(`-- Error: File not found.\n-- The file may have been deleted or the link is invalid.\n-- ID: ${id}`);
    }

    if (!response.ok) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(response.status).send(`-- Error: Failed to fetch file (${response.status})`);
    }

    const data = await response.json();
    const fields = data.fields;

    if (!fields || !fields.content || !fields.content.stringValue) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(404).send("-- Error: File content not found");
    }

    // Decode: base64 → XOR decrypt (key 0x5A = 'Z', same as dashboard)
    const XOR_KEY  = 0x5A;
    const encBytes = Buffer.from(fields.content.stringValue, "base64");
    const decBytes = Buffer.from(encBytes.map((b) => b ^ XOR_KEY));
    const text     = decBytes.toString("utf-8");
    const name     = fields.name?.stringValue || id;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${name}"`);
    res.setHeader("X-File-Name", name);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(text);

  } catch (err) {
    console.error("[api/raw] Error:", err);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(500).send(`-- Server error: ${err.message}`);
  }
}
