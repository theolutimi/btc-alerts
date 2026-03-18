import { useState, useEffect, useRef, useCallback } from "react";

const BINANCE_WS = "wss://stream.binance.com:9443/ws/btcusdt@kline_1m";
const BINANCE_REST = "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=30";
const FUNDING_URL = "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1";
const TICKER_URL = "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT";

// Bollinger Band calculation
function calcBollinger(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: mean + mult * std,
    lower: mean - mult * std,
    middle: mean,
    width: ((mean + mult * std - (mean - mult * std)) / mean) * 100,
    std,
  };
}

// Trend detection on higher timeframe
function detectTrend(closes) {
  if (closes.length < 15) return "NEUTRAL";
  const recent = closes.slice(-15);
  const firstHalf = recent.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
  const secondHalf = recent.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const diff = ((secondHalf - firstHalf) / firstHalf) * 100;
  if (diff > 0.05) return "UP";
  if (diff < -0.05) return "DOWN";
  return "NEUTRAL";
}

// Volume spike detection
function detectVolumeSpike(volumes) {
  if (volumes.length < 20) return { spike: false, ratio: 1 };
  const avg = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19;
  const current = volumes[volumes.length - 1];
  const ratio = avg > 0 ? current / avg : 1;
  return { spike: ratio > 3, ratio };
}

const playColors = {
  LIQUIDATION: "#FF3B30",
  SQUEEZE: "#5856D6",
  FUNDING: "#FF9500",
  VOLUME: "#30D158",
};

const alertSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "square";
    gain.gain.value = 0.15;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // silent fail
  }
};

export default function AlertDashboard() {
  const [price, setPrice] = useState(null);
  const [candles, setCandles] = useState([]);
  const [funding, setFunding] = useState(null);
  const [volume24h, setVolume24h] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [settings, setSettings] = useState({
    squeezeThreshold: 0.35,
    volumeSpikeRatio: 3,
    fundingExtreme: 0.01,
    soundEnabled: true,
    maxAlerts: 50,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);
  const wsRef = useRef(null);
  const alertIdRef = useRef(0);
  const lastAlertTimeRef = useRef({});
  const candlesRef = useRef([]);

  // Cooldown check — don't repeat same alert type within 60s
  const canAlert = useCallback((type) => {
    const now = Date.now();
    const last = lastAlertTimeRef.current[type] || 0;
    if (now - last < 60000) return false;
    lastAlertTimeRef.current[type] = now;
    return true;
  }, []);

  const pushAlert = useCallback(
    (type, title, detail, direction) => {
      if (!canAlert(type)) return;
      if (settings.soundEnabled) alertSound();
      const id = ++alertIdRef.current;
      setAlerts((prev) => [
        { id, type, title, detail, direction, time: new Date(), seen: false },
        ...prev.slice(0, settings.maxAlerts - 1),
      ]);
    },
    [canAlert, settings.soundEnabled, settings.maxAlerts]
  );

  // Fetch initial candles
  useEffect(() => {
    fetch(BINANCE_REST)
      .then((r) => r.json())
      .then((data) => {
        const parsed = data.map((k) => ({
          time: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        setCandles(parsed);
        candlesRef.current = parsed;
      })
      .catch(() => {});
  }, []);

  // Fetch funding rate
  useEffect(() => {
    const fetchFunding = () => {
      fetch(FUNDING_URL)
        .then((r) => r.json())
        .then((data) => {
          if (data && data[0]) {
            setFunding(parseFloat(data[0].fundingRate));
          }
        })
        .catch(() => {});
    };
    fetchFunding();
    const iv = setInterval(fetchFunding, 30000);
    return () => clearInterval(iv);
  }, []);

  // Fetch 24h volume
  useEffect(() => {
    const fetchTicker = () => {
      fetch(TICKER_URL)
        .then((r) => r.json())
        .then((data) => {
          if (data && data.quoteVolume) {
            setVolume24h(parseFloat(data.quoteVolume));
          }
        })
        .catch(() => {});
    };
    fetchTicker();
    const iv = setInterval(fetchTicker, 15000);
    return () => clearInterval(iv);
  }, []);

  // WebSocket for live candles
  useEffect(() => {
    let reconnectTimer;
    const connect = () => {
      const ws = new WebSocket(BINANCE_WS);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const k = msg.k;
        if (!k) return;

        const candle = {
          time: k.t,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };

        setPrice(candle.close);

        setCandles((prev) => {
          let updated;
          if (prev.length > 0 && prev[prev.length - 1].time === candle.time) {
            updated = [...prev.slice(0, -1), candle];
          } else {
            updated = [...prev.slice(-29), candle];
          }
          candlesRef.current = updated;
          return updated;
        });
      };
    };

    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  // Analysis engine — runs every 2 seconds
  useEffect(() => {
    const analyze = () => {
      const c = candlesRef.current;
      if (c.length < 20) return;

      const closes = c.map((x) => x.close);
      const volumes = c.map((x) => x.volume);
      const currentPrice = closes[closes.length - 1];
      const bb = calcBollinger(closes);
      const trend = detectTrend(closes);
      const volSpike = detectVolumeSpike(volumes);

      setLastCheck(new Date());

      // PLAY 1 — Bollinger Squeeze Detection
      if (bb) {
        // Check if bands are compressed
        if (bb.width < settings.squeezeThreshold) {
          const lastClose = closes[closes.length - 1];
          const prevClose = closes[closes.length - 2];

          // Breakout detection — price crosses band
          if (lastClose > bb.upper && prevClose <= bb.upper) {
            pushAlert(
              "SQUEEZE",
              "BOLLINGER BREAKOUT — UPSIDE",
              `Price broke above upper band ($${bb.upper.toFixed(0)}). Squeeze width: ${bb.width.toFixed(3)}%. 15-min trend: ${trend}. Breakout candle confirmed.`,
              "UP"
            );
          } else if (lastClose < bb.lower && prevClose >= bb.lower) {
            pushAlert(
              "SQUEEZE",
              "BOLLINGER BREAKOUT — DOWNSIDE",
              `Price broke below lower band ($${bb.lower.toFixed(0)}). Squeeze width: ${bb.width.toFixed(3)}%. 15-min trend: ${trend}. Breakout candle confirmed.`,
              "DOWN"
            );
          } else {
            // Squeeze building — pre-alert
            pushAlert(
              "SQUEEZE",
              "SQUEEZE DETECTED — BREAKOUT IMMINENT",
              `Bollinger width at ${bb.width.toFixed(3)}% (threshold: ${settings.squeezeThreshold}%). 15-min trend: ${trend}. Watch for breakout candle closing outside bands. Suggested direction: ${trend === "NEUTRAL" ? "WAIT" : trend}.`,
              trend === "UP" ? "UP" : trend === "DOWN" ? "DOWN" : "NEUTRAL"
            );
          }
        }
      }

      // PLAY 2 — Volume Spike
      if (volSpike.spike && volSpike.ratio >= settings.volumeSpikeRatio) {
        const lastCandle = c[c.length - 1];
        const dir = lastCandle.close > lastCandle.open ? "UP" : "DOWN";
        pushAlert(
          "VOLUME",
          `VOLUME SPIKE — ${volSpike.ratio.toFixed(1)}x AVERAGE`,
          `Current candle volume is ${volSpike.ratio.toFixed(1)}x the 20-period average. Large player likely executing. Candle direction: ${dir}. Price: $${currentPrice.toFixed(0)}.`,
          dir
        );
      }

      // PLAY 3 — Funding Rate Extreme
      if (funding !== null) {
        if (Math.abs(funding) >= settings.fundingExtreme) {
          const dir = funding > 0 ? "DOWN" : "UP";
          pushAlert(
            "FUNDING",
            `EXTREME FUNDING RATE — ${(funding * 100).toFixed(4)}%`,
            `Funding is ${funding > 0 ? "heavily positive (longs paying shorts)" : "heavily negative (shorts paying longs)"}. Market is overleveraged ${funding > 0 ? "long" : "short"}. Correction likely direction: ${dir}.`,
            dir
          );
        }
      }
    };

    const iv = setInterval(analyze, 2000);
    return () => clearInterval(iv);
  }, [settings, funding, pushAlert]);

  const bb = candles.length >= 20 ? calcBollinger(candles.map((c) => c.close)) : null;
  const trend = candles.length >= 15 ? detectTrend(candles.map((c) => c.close)) : "—";
  const volSpike = candles.length >= 20 ? detectVolumeSpike(candles.map((c) => c.volume)) : { ratio: 1 };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#09090B",
        color: "#E4E4E7",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      }}
    >
      {/* Scanline overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto", padding: "20px 16px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: connected ? "#30D158" : "#FF3B30",
                  boxShadow: connected ? "0 0 8px #30D158" : "0 0 8px #FF3B30",
                  animation: connected ? "pulse 2s infinite" : "none",
                }}
              />
              <span style={{ fontSize: 11, color: "#666", letterSpacing: 2 }}>
                {connected ? "LIVE" : "RECONNECTING..."}
              </span>
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: "6px 0 0",
                letterSpacing: -0.5,
                color: "#FAFAFA",
              }}
            >
              BTC ALERT ENGINE
            </h1>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: "8px 14px",
              background: showSettings ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              color: "#999",
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "inherit",
            }}
          >
            {showSettings ? "CLOSE" : "SETTINGS"}
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: 20,
              marginBottom: 16,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            {[
              {
                label: "Squeeze Threshold %",
                key: "squeezeThreshold",
                step: 0.05,
                min: 0.1,
                max: 1,
              },
              {
                label: "Volume Spike Ratio",
                key: "volumeSpikeRatio",
                step: 0.5,
                min: 2,
                max: 10,
              },
              {
                label: "Funding Extreme %",
                key: "fundingExtreme",
                step: 0.005,
                min: 0.005,
                max: 0.05,
              },
            ].map((s) => (
              <div key={s.key}>
                <label style={{ fontSize: 10, color: "#666", letterSpacing: 1, display: "block", marginBottom: 6 }}>
                  {s.label}
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={settings[s.key]}
                    onChange={(e) => setSettings((p) => ({ ...p, [s.key]: parseFloat(e.target.value) }))}
                    style={{ flex: 1, accentColor: "#5856D6" }}
                  />
                  <span style={{ fontSize: 12, color: "#AAA", minWidth: 50, textAlign: "right" }}>
                    {s.key === "fundingExtreme"
                      ? (settings[s.key] * 100).toFixed(2) + "%"
                      : settings[s.key].toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 10, color: "#666", letterSpacing: 1 }}>SOUND</label>
              <button
                onClick={() => setSettings((p) => ({ ...p, soundEnabled: !p.soundEnabled }))}
                style={{
                  padding: "4px 12px",
                  background: settings.soundEnabled ? "rgba(48, 209, 88, 0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${settings.soundEnabled ? "#30D158" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 4,
                  color: settings.soundEnabled ? "#30D158" : "#666",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "inherit",
                }}
              >
                {settings.soundEnabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        )}

        {/* Status Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            marginBottom: 20,
          }}
        >
          {[
            {
              label: "BTC PRICE",
              value: price ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—",
              color: "#FAFAFA",
            },
            {
              label: "BB WIDTH",
              value: bb ? `${bb.width.toFixed(3)}%` : "—",
              color: bb && bb.width < settings.squeezeThreshold ? "#FF3B30" : "#5856D6",
              flash: bb && bb.width < settings.squeezeThreshold,
            },
            {
              label: "15M TREND",
              value: trend,
              color: trend === "UP" ? "#30D158" : trend === "DOWN" ? "#FF3B30" : "#666",
            },
            {
              label: "VOL RATIO",
              value: `${volSpike.ratio.toFixed(1)}x`,
              color: volSpike.ratio >= settings.volumeSpikeRatio ? "#30D158" : "#666",
              flash: volSpike.ratio >= settings.volumeSpikeRatio,
            },
            {
              label: "FUNDING",
              value: funding !== null ? `${(funding * 100).toFixed(4)}%` : "—",
              color:
                funding !== null && Math.abs(funding) >= settings.fundingExtreme
                  ? "#FF9500"
                  : "#666",
              flash: funding !== null && Math.abs(funding) >= settings.fundingExtreme,
            },
            {
              label: "24H VOL",
              value: volume24h
                ? `$${(volume24h / 1e9).toFixed(2)}B`
                : "—",
              color: "#64D2FF",
            },
          ].map((card, i) => (
            <div
              key={i}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${card.flash ? card.color + "40" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 8,
                padding: "12px 14px",
                animation: card.flash ? "glow 1.5s ease-in-out infinite alternate" : "none",
              }}
            >
              <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* Alert Feed */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 11, color: "#888", letterSpacing: 1.5, fontWeight: 700 }}>
              ALERT FEED
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {alerts.length > 0 && (
                <button
                  onClick={() => setAlerts([])}
                  style={{
                    padding: "3px 8px",
                    background: "rgba(255,59,48,0.1)",
                    border: "1px solid rgba(255,59,48,0.2)",
                    borderRadius: 4,
                    color: "#FF3B30",
                    cursor: "pointer",
                    fontSize: 9,
                    fontFamily: "inherit",
                    letterSpacing: 1,
                  }}
                >
                  CLEAR
                </button>
              )}
              <span style={{ fontSize: 9, color: "#444" }}>
                {lastCheck ? `Checked ${lastCheck.toLocaleTimeString()}` : "Waiting..."}
              </span>
            </div>
          </div>

          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            {alerts.length === 0 ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "#333",
                  fontSize: 12,
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>◎</div>
                Monitoring... alerts will appear here when conditions are met.
                <br />
                <span style={{ fontSize: 10, color: "#282828" }}>
                  Engine scans every 2 seconds
                </span>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                    borderLeft: `3px solid ${playColors[alert.type]}`,
                    background: `${playColors[alert.type]}08`,
                    animation: "fadeIn 0.3s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 9,
                          padding: "2px 6px",
                          borderRadius: 3,
                          background: playColors[alert.type] + "20",
                          color: playColors[alert.type],
                          fontWeight: 700,
                          letterSpacing: 1,
                        }}
                      >
                        {alert.type}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          padding: "2px 6px",
                          borderRadius: 3,
                          background:
                            alert.direction === "UP"
                              ? "rgba(48,209,88,0.15)"
                              : alert.direction === "DOWN"
                              ? "rgba(255,59,48,0.15)"
                              : "rgba(255,255,255,0.05)",
                          color:
                            alert.direction === "UP"
                              ? "#30D158"
                              : alert.direction === "DOWN"
                              ? "#FF3B30"
                              : "#666",
                          fontWeight: 700,
                          letterSpacing: 1,
                        }}
                      >
                        {alert.direction === "UP" ? "▲ BET YES" : alert.direction === "DOWN" ? "▼ BET NO" : "⏸ WAIT"}
                      </span>
                    </div>
                    <span style={{ fontSize: 9, color: "#444" }}>
                      {alert.time.toLocaleTimeString()}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#E4E4E7",
                      marginBottom: 4,
                    }}
                  >
                    {alert.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#777",
                      lineHeight: 1.5,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    }}
                  >
                    {alert.detail}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Play Legend */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 14,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {Object.entries(playColors).map(([key, color]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 9, color: "#555", letterSpacing: 1 }}>{key}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 16,
            padding: "10px 14px",
            background: "rgba(255,149,0,0.05)",
            border: "1px solid rgba(255,149,0,0.12)",
            borderRadius: 6,
            fontSize: 9,
            color: "#FF9500",
            textAlign: "center",
            letterSpacing: 0.3,
            lineHeight: 1.6,
          }}
        >
          SIGNALS ONLY — NOT FINANCIAL ADVICE. EXECUTE AT YOUR OWN RISK. ALL GAMBLING CARRIES RISK OF TOTAL LOSS.
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes glow {
          from { box-shadow: 0 0 2px rgba(255,255,255,0.05); }
          to { box-shadow: 0 0 12px rgba(255,255,255,0.08); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        input[type="range"] { height: 3px; }
      `}</style>
    </div>
  );
}
