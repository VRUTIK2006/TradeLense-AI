
function smaAt(candles, endIndex, period) {
  if (endIndex + 1 < period) return null;

  let sum = 0;

  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    sum += candles[i].close;
  }

  return sum / period;
}

export function runBacktest(
  candles,
  initialCapital = 100000,
  costRate = 0.001
) {
  if (!Array.isArray(candles) || candles.length < 21) {
    throw new Error("At least 21 candles are required");
  }

  if (
    !Number.isFinite(initialCapital) ||
    initialCapital <= 0 ||
    !Number.isFinite(costRate) ||
    costRate < 0 ||
    costRate >= 1
  ) {
    throw new Error("Invalid capital or trading cost");
  }

  const sorted = [...candles].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  if (
    sorted.some(
      (c, i) =>
        !Number.isFinite(c.close) ||
        c.close <= 0 ||
        !Number.isFinite(Date.parse(c.date)) ||
        (i > 0 && c.date === sorted[i - 1].date)
    )
  ) {
    throw new Error("Candles contain invalid prices, dates, or duplicates");
  }

  let cash = initialCapital;
  let shares = 0;
  let entryPrice = 0;
  let completedTrades = [];
  let position = "CASH";

  // Use yesterday's signal to trade at today's close.
  // This avoids buying at a close before that close is known.
  for (let i = 20; i < sorted.length; i++) {
    const previousFast = smaAt(sorted, i - 1, 5);
    const previousSlow = smaAt(sorted, i - 1, 20);
    const currentFast = smaAt(sorted, i, 5);
    const currentSlow = smaAt(sorted, i, 20);

    const crossedAbove =
      previousFast <= previousSlow &&
      currentFast > currentSlow;

    const crossedBelow =
      previousFast >= previousSlow &&
      currentFast < currentSlow;

    const price = sorted[i].close;

    if (position === "CASH" && crossedAbove) {
      shares = cash / (price * (1 + costRate));
      const spent = shares * price * (1 + costRate);
      cash -= spent;
      entryPrice = price;
      position = "LONG";
    } else if (position === "LONG" && crossedBelow) {
      const proceeds = shares * price * (1 - costRate);

      completedTrades.push({
        entryPrice: Number(entryPrice.toFixed(2)),
        exitPrice: Number(price.toFixed(2)),
        returnPercent: Number(
          (((price - entryPrice) / entryPrice) * 100).toFixed(2)
        ),
      });

      cash += proceeds;
      shares = 0;
      position = "CASH";
    }
  }

  const lastPrice = sorted[sorted.length - 1].close;
  const finalCapital = cash + shares * lastPrice;
  const profitableTrades = completedTrades.filter(
    (trade) => trade.exitPrice > trade.entryPrice
  ).length;

  return {
    startingCapital: initialCapital,
    finalCapital: Number(finalCapital.toFixed(2)),
    netProfit: Number((finalCapital - initialCapital).toFixed(2)),
    totalReturnPercent: Number(
      (((finalCapital - initialCapital) / initialCapital) * 100).toFixed(2)
    ),
    totalTrades: completedTrades.length,
    winRatePercent: completedTrades.length
      ? Number(
          ((profitableTrades / completedTrades.length) * 100).toFixed(2)
        )
      : 0,
    openPosition: position,
    trades: completedTrades,
    note: "Historical simulation only; results exclude taxes, slippage, and other real-world constraints.",
  };
}
