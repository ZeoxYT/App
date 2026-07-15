export default function handler(req, res) {
  const { id } = req.query;

  res.status(200).send(`Raw file ID: ${id}`);
}
