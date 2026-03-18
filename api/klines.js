export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const response = await fetch(
      "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=30"
    );
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "upstream fetch failed" });
  }
}
