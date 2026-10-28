import { useEffect, useMemo, useRef, useState } from "react";
import "./index.css";
import ReactMarkdown from "react-markdown";

const API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "/api" : "http://localhost:5000/api");

const INDIAN_STOCKS = [
  { symbol: "RELIANCE.BSE", name: "Reliance Industries" },
  { symbol: "TCS.BSE", name: "Tata Consultancy Services" },
  { symbol: "INFY.BSE", name: "Infosys" },
  { symbol: "HDFCBANK.BSE", name: "HDFC Bank" },
  { symbol: "ICICIBANK.BSE", name: "ICICI Bank" },
  { symbol: "SBIN.BSE", name: "State Bank of India" },
  { symbol: "ITC.BSE", name: "ITC Limited" },
  { symbol: "LT.BSE", name: "Larsen & Toubro" },
  { symbol: "TATAMOTORS.BSE", name: "Tata Motors" },
  { symbol: "BHARTIARTL.BSE", name: "Bharti Airtel" },
];

function money(value) {
  if (!Number.isFinite(value)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function Metric({ label, value, detail, tone }) {
  return (
    <div className={`metric ${tone ? `metric-${tone}` : ""}`}>
      <p className="muted">{label}</p>
      <h2>{value}</h2>
      {detail && <p className="muted small">{detail}</p>}
    </div>
  );
}

function Sparkline({ points }) {
  if (!Array.isArray(points) || points.length < 2) return null;

  const values = points.map((point) => point.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 320;
  const height = 72;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const up = values[values.length - 1] >= values[0];

  return (
    <svg
      className={`sparkline ${up ? "up" : "down"}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Recent closing prices"
    >
      <path d={path} fill="none" strokeWidth="2.5" />
    </svg>
  );
}

function App() {
  const [symbol, setSymbol] = useState("RELIANCE.BSE");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [research, setResearch] = useState("");
  const [researchLoading, setResearchLoading] = useState(false);
  const [agentQuestion, setAgentQuestion] = useState("");
  const [agentAnswer, setAgentAnswer] = useState("");
  const [agentTool, setAgentTool] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [agentLogs, setAgentLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState("");
  const [knowledgeQuestion, setKnowledgeQuestion] = useState("");
  const [knowledgeAnswer, setKnowledgeAnswer] = useState("");
  const [knowledgeSources, setKnowledgeSources] = useState([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const analyzeRequest = useRef(0);

  const filteredStocks = useMemo(() => {
    const query = symbol.trim().toLowerCase();
    if (!query) return INDIAN_STOCKS;

    return INDIAN_STOCKS.filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query)
    );
  }, [symbol]);

  async function analyzeStock(event, nextSymbol = symbol) {
    event?.preventDefault();

    const selectedSymbol = nextSymbol.trim().toUpperCase();

    if (!/^[A-Z0-9.-]{1,15}$/.test(selectedSymbol)) {
      setError("Enter a valid stock symbol.");
      return;
    }

    const requestId = ++analyzeRequest.current;
    setLoading(true);
    setError("");
    setResult(null);
    setResearch("");
    setShowSuggestions(false);

    try {
      const response = await fetch(
        `${API}/stocks/${encodeURIComponent(selectedSymbol)}/analyze`
      );
      const data = await response.json();

      if (requestId !== analyzeRequest.current) return;

      if (!response.ok) {
        throw new Error(data.error || "Stock analysis failed.");
      }

      setResult(data);
      setSymbol(selectedSymbol);
    } catch (err) {
      if (requestId !== analyzeRequest.current) return;
      setError(
        `${err.message} Check that the backend is running and your market-data API is available.`
      );
    } finally {
      if (requestId === analyzeRequest.current) {
        setLoading(false);
      }
    }
  }

  async function generateResearch() {
    if (!result || researchLoading) return;

    setResearchLoading(true);
    setResearch("");

    try {
      const response = await fetch(`${API}/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan: result.scan,
          backtest: result.backtest,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Research generation failed.");
      }

      setResearch(data.report);
    } catch (err) {
      setResearch(`Unable to generate report: ${err.message}`);
    } finally {
      setResearchLoading(false);
    }
  }

  async function askKnowledgeAssistant(event) {
    event.preventDefault();

    const question = knowledgeQuestion.trim();
    if (!question || knowledgeLoading) return;

    setKnowledgeLoading(true);
    setKnowledgeError("");
    setKnowledgeAnswer("");
    setKnowledgeSources([]);

    try {
      const response = await fetch(`${API}/knowledge/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Knowledge request failed.");
      }

      setKnowledgeAnswer(data.answer || "No answer was returned.");
      setKnowledgeSources(data.sources || []);
    } catch (err) {
      setKnowledgeError(
        err.message || "Unable to contact the knowledge assistant."
      );
    } finally {
      setKnowledgeLoading(false);
    }
  }

  const loadAgentLogs = async () => {
    try {
      setLogsLoading(true);
      setLogsError("");

      const response = await fetch(`${API}/agent/logs`);

      if (!response.ok) {
        throw new Error("Could not load agent activity.");
      }

      const data = await response.json();
      setAgentLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      setLogsError(err.message || "Failed to load activity.");
    } finally {
      setLogsLoading(false);
    }
  };

  const askAgent = async (event) => {
    event.preventDefault();

    if (!agentQuestion.trim() || agentLoading) return;

    setAgentLoading(true);
    setAgentError("");
    setAgentAnswer("");
    setAgentTool("");

    try {
      const response = await fetch(`${API}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: agentQuestion.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Agent request failed.");
      }

      setAgentAnswer(data.answer || "No answer was returned.");
      setAgentTool(data.toolUsed || "");
      await loadAgentLogs();
    } catch (err) {
      setAgentError(err.message || "Unable to connect to the AI agent.");
    } finally {
      setAgentLoading(false);
    }
  };

  useEffect(() => {
    loadAgentLogs();
  }, []);

  const netProfit = result?.backtest?.netProfit;
  const signal = result?.scan?.signal || "UNAVAILABLE";

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">T</div>
          <div>
            <h1>TradeLens AI</h1>
            <p className="muted small">Research · Signals · Backtesting</p>
          </div>
        </div>
        <span className="status">
          <span /> Educational research
        </span>
      </header>

      <section className="intro">
        <p className="eyebrow">MARKET RESEARCH WORKSPACE</p>
        <h2>Understand the data. Test the strategy.</h2>
        <p className="muted">
          Explore historical price signals and evaluate a simple SMA strategy.
          This is a research prototype, not live trading.
        </p>
      </section>

      <section className="search-panel">
        <form onSubmit={analyzeStock}>
          <label htmlFor="symbol">Search Indian stocks</label>

          <div className="stock-search">
            <input
              id="symbol"
              value={symbol}
              onChange={(event) => {
                setSymbol(event.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 180);
              }}
              placeholder="Search company or ticker..."
              autoComplete="off"
              maxLength={20}
            />

            {showSuggestions && symbol.trim() && (
              <div className="stock-suggestions">
                {filteredStocks.length > 0 ? (
                  filteredStocks.map((stock) => (
                    <button
                      type="button"
                      key={stock.symbol}
                      className="stock-suggestion"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSymbol(stock.symbol);
                        setShowSuggestions(false);
                        analyzeStock(undefined, stock.symbol);
                      }}
                    >
                      <span className="suggestion-symbol">{stock.symbol}</span>
                      <span className="suggestion-name">{stock.name}</span>
                    </button>
                  ))
                ) : (
                  <p className="no-suggestions">
                    No match in popular stocks. You can still enter a ticker
                    manually.
                  </p>
                )}
              </div>
            )}

            <button type="submit" disabled={loading}>
              {loading ? "Analyzing..." : "Analyze stock"}
            </button>
          </div>
        </form>

        <div className="popular-stocks">
          <p className="muted small">Popular stocks</p>
          <div className="stock-chips">
            {INDIAN_STOCKS.map((stock) => (
              <button
                type="button"
                key={stock.symbol}
                className={`stock-chip ${
                  symbol === stock.symbol ? "selected" : ""
                }`}
                onClick={() => {
                  setSymbol(stock.symbol);
                  analyzeStock(undefined, stock.symbol);
                }}
              >
                {stock.name}
              </button>
            ))}
          </div>
        </div>

        <p className="muted small">
          Historical data and ticker availability depend on your market-data
          provider.
        </p>
      </section>

      {error && <div className="error">{error}</div>}

      {loading && (
        <div className="loading">Fetching data and running backtest...</div>
      )}

      {result && (
        <>
          <section className="section-heading">
            <div>
              <p className="eyebrow">STOCK OVERVIEW</p>
              <h2>{result.scan.symbol}</h2>
            </div>
            <span className="date">Latest data: {result.scan.latestDate}</span>
          </section>

          <Sparkline points={result.scan.sparkline} />

          <section className="metrics">
            <Metric
              label="Latest close"
              value={money(result.scan.latestClose)}
              detail="Quoted by the market-data provider"
            />
            <Metric
              label="5-day SMA"
              value={
                result.scan.sma5 == null ? "Unavailable" : money(result.scan.sma5)
              }
              detail="Average of the latest five closes"
            />
            <Metric
              label="SMA signal"
              value={String(signal).replaceAll("_", " ")}
              detail="A price condition, not a prediction"
              tone={
                signal === "ABOVE_SMA"
                  ? "positive"
                  : signal === "AT_OR_BELOW_SMA"
                    ? "negative"
                    : ""
              }
            />
          </section>

          <section className="section-heading backtest-heading">
            <div>
              <p className="eyebrow">STRATEGY SIMULATION</p>
              <h2>5-day / 20-day SMA crossover</h2>
            </div>
            <span className="tag">Historical backtest</span>
          </section>

          <section className="metrics">
            <Metric
              label="Final portfolio value"
              value={money(result.backtest.finalCapital)}
              detail={`Starting: ${money(result.backtest.startingCapital)}`}
            />
            <Metric
              label="Net profit / loss"
              value={money(netProfit)}
              detail={`${result.backtest.totalReturnPercent}% total return`}
              tone={netProfit >= 0 ? "positive" : "negative"}
            />
            <Metric
              label="Completed trades"
              value={result.backtest.totalTrades}
              detail={`${result.backtest.winRatePercent}% profitable by trade count`}
            />
          </section>

          <section className="panel">
            <h3>Completed trades</h3>
            {result.backtest.trades.length === 0 ? (
              <p className="muted">
                No completed trades were generated for this historical period.
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Trade</th>
                      <th>Entry</th>
                      <th>Exit</th>
                      <th>Price return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.backtest.trades.map((trade, index) => (
                      <tr key={`${index}-${trade.entryPrice}-${trade.exitPrice}`}>
                        <td>#{index + 1}</td>
                        <td>{money(trade.entryPrice)}</td>
                        <td>{money(trade.exitPrice)}</td>
                        <td
                          className={
                            trade.returnPercent >= 0 ? "positive" : "negative"
                          }
                        >
                          {trade.returnPercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted small disclaimer">
              Simulation only. Results exclude taxes, slippage and other
              real-world constraints. Historical returns do not predict future
              performance.
            </p>
          </section>

          <section className="panel ai-panel">
            <p className="eyebrow">GEMINI RESEARCH ASSISTANT</p>
            <h3>Understand your results</h3>
            <p className="muted">
              Generate an explanation grounded in the scanner and backtest
              figures.
            </p>
            <button onClick={generateResearch} disabled={researchLoading}>
              {researchLoading ? "Generating report..." : "Generate AI research"}
            </button>
            {research && (
              <div className="research-report">
                <h3>Research report</h3>
                <div className="markdown-report">
                  <ReactMarkdown>{research}</ReactMarkdown>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {!result && !loading && !error && (
        <section className="empty-state">
          <div className="empty-icon">↗</div>
          <h3>Your research workspace is ready</h3>
          <p className="muted">
            Analyze a symbol to view its historical signal and backtest metrics.
          </p>
        </section>
      )}

      <div className="assistants-grid">
        <section className="agent-panel">
          <div className="agent-heading">
            <div>
              <h2>TradeLens AI Assistant</h2>
              <p>Ask questions about stock signals and historical backtests.</p>
            </div>
            <span className="agent-badge">AI Agent</span>
          </div>

          <form onSubmit={askAgent} className="agent-form">
            <textarea
              value={agentQuestion}
              onChange={(event) => setAgentQuestion(event.target.value)}
              placeholder="e.g. Analyze RELIANCE.BSE and explain the backtest results..."
              rows={3}
              disabled={agentLoading}
            />
            <button
              type="submit"
              disabled={agentLoading || !agentQuestion.trim()}
            >
              {agentLoading ? "Analyzing..." : "Ask AI Agent"}
            </button>
          </form>

          {agentLoading && (
            <p className="agent-status">
              The agent is analyzing your request...
            </p>
          )}
          {agentError && <p className="agent-error">{agentError}</p>}
          {agentAnswer && (
            <div className="agent-answer">
              <div className="agent-answer-heading">
                <h3>Agent response</h3>
                {agentTool && <span className="agent-tool">Tool: {agentTool}</span>}
              </div>
              <ReactMarkdown>{agentAnswer}</ReactMarkdown>
            </div>
          )}
        </section>

        <section className="panel knowledge-panel">
          <p className="eyebrow">RAG · KNOWLEDGE RETRIEVAL</p>
          <h2>Financial knowledge assistant</h2>
          <p className="muted">
            Answers grounded in retrieved financial education documents.
          </p>

          <form onSubmit={askKnowledgeAssistant}>
            <label htmlFor="knowledge-question">Ask a financial concept</label>
            <textarea
              id="knowledge-question"
              value={knowledgeQuestion}
              onChange={(event) => setKnowledgeQuestion(event.target.value)}
              placeholder="e.g. Does a high win rate guarantee profitability?"
              rows={3}
              maxLength={1000}
            />
            <button
              type="submit"
              disabled={knowledgeLoading || !knowledgeQuestion.trim()}
            >
              {knowledgeLoading
                ? "Retrieving and generating..."
                : "Ask knowledge assistant"}
            </button>
          </form>

          {knowledgeError && <p className="error-message">{knowledgeError}</p>}

          {knowledgeAnswer && (
            <div className="knowledge-answer">
              <h3>Answer</h3>
              <ReactMarkdown>{knowledgeAnswer}</ReactMarkdown>
              {knowledgeSources.length > 0 && (
                <div className="knowledge-sources">
                  <h3>Retrieved sources</h3>
                  {knowledgeSources.map((source) => (
                    <div className="knowledge-source" key={source.citation}>
                      <strong>
                        {source.citation} {source.title}
                      </strong>
                      <p className="muted small">{source.source}</p>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        Open reference
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="activity-panel">
        <div className="activity-header">
          <div>
            <h2>Agent activity</h2>
            <p>Recent tool executions recorded in MongoDB.</p>
          </div>
          <button
            type="button"
            onClick={loadAgentLogs}
            disabled={logsLoading}
            className="activity-refresh"
          >
            {logsLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {logsError && <p className="activity-error">{logsError}</p>}

        {logsLoading && agentLogs.length === 0 ? (
          <p className="activity-muted">Loading activity...</p>
        ) : agentLogs.length === 0 ? (
          <p className="activity-muted">
            No activity yet. Ask the AI agent a question to get started.
          </p>
        ) : (
          <div className="activity-list">
            {agentLogs.map((log) => (
              <article className="activity-item" key={log._id}>
                <div className="activity-item-top">
                  <span className="activity-symbol">{log.symbol}</span>
                  <span className="activity-tool">{log.toolUsed}</span>
                </div>
                <p className="activity-question">{log.question}</p>
                <p className="activity-muted">
                  {log.createdAt
                    ? new Date(log.createdAt).toLocaleString()
                    : "Time unavailable"}
                </p>
                <details>
                  <summary>View agent response and tool result</summary>
                  <div className="activity-detail">
                    <h4>Agent response</h4>
                    <ReactMarkdown>{log.answer || ""}</ReactMarkdown>
                    <h4>Tool result</h4>
                    <pre>{JSON.stringify(log.toolResult, null, 2)}</pre>
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        TradeLens AI · Educational research prototype · No live orders
      </footer>
    </main>
  );
}

export default App;
