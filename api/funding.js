export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const response = await fetch(
      "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1"
    );
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "upstream fetch failed" });
  }
}
