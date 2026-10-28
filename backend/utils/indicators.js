export function calculateSMA(candles, period = 5) {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("Period must be a positive integer");
  }

  if (candles.length < period) {
    return null;
  }

  const recentCandles = candles.slice(-period);

  const total = recentCandles.reduce(
    (sum, candle) => sum + candle.close,
    0
  );

  return Number((total / period).toFixed(2));
}