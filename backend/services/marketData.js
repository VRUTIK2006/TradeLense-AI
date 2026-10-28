import { calculateSMA } from "../utils/indicators.js";

export function normalizeSymbol(raw, maxLength = 15) {
  const symbol = String(raw || "").trim().toUpperCase();

  if (!new RegExp(`^[A-Z0-9.-]{1,${maxLength}}$`).test(symbol)) {
    const error = new Error("Invalid stock symbol");
    error.status = 400;
    throw error;
  }

  return symbol;
}

export async function fetchDailyCandles(symbol) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    const error = new Error("Market-data API key is not configured");
    error.status = 500;
    throw error;
  }

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "TIME_SERIES_DAILY");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("outputsize", "compact");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url);
  const data = await response.json();
  const timeSeries = data["Time Series (Daily)"];

  if (!response.ok || !timeSeries) {
    const error = new Error(
      data["Error Message"] ||
        data.Note ||
        data.Information ||
        data["Note"] ||
        data["Information"] ||
        "Unable to retrieve market data. Try again later."
    );
    error.status = 502;
    throw error;
  }

  const candles = Object.entries(timeSeries)
    .map(([date, values]) => ({
      date,
      open: Number(values["1. open"]),
      high: Number(values["2. high"]),
      low: Number(values["3. low"]),
      close: Number(values["4. close"]),
      volume: Number(values["5. volume"]),
    }))
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (candles.length === 0) {
    const error = new Error("No valid price data was returned");
    error.status = 502;
    throw error;
  }

  return candles;
}

export function buildScan(symbol, candles) {
  const latest = candles[candles.length - 1];
  const sma5 = calculateSMA(candles, 5);

  return {
    symbol,
    latestDate: latest.date,
    latestClose: latest.close,
    sma5,
    signal:
      sma5 === null
        ? "INSUFFICIENT_DATA"
        : latest.close > sma5
          ? "ABOVE_SMA"
          : "AT_OR_BELOW_SMA",
    sparkline: candles.slice(-40).map((candle) => ({
      date: candle.date,
      close: candle.close,
    })),
  };
}
