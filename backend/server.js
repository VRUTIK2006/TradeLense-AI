import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import AgentLog from "./models/AgentLog.js";
import { retrieveKnowledge } from "./services/ragService.js";
import { runBacktest } from "./utils/backtest.js";
import {
  buildScan,
  fetchDailyCandles,
  normalizeSymbol,
} from "./services/marketData.js";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const agentTools = [
  {
    functionDeclarations: [
      {
        name: "get_stock_analysis",
        description:
          "Get the latest available stock scan signal and historical backtest for a stock symbol.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Stock ticker symbol, for example IBM or TCS.BSE",
            },
          },
          required: ["symbol"],
        },
      },
      {
        name: "run_backtest",
        description:
          "Retrieve historical backtest performance when the user specifically asks about strategy returns, win rate, trades, or backtest results.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Stock ticker symbol, for example IBM or TCS.BSE",
            },
          },
          required: ["symbol"],
        },
      },
    ],
  },
];

const app = express();

app.use(cors());
app.use(express.json());

function sendError(res, error, fallbackMessage) {
  const status = error.status || 500;
  res.status(status).json({
    error: error.status ? error.message : fallbackMessage,
  });
}

function extractGeminiText(response) {
  try {
    if (typeof response?.text === "string" && response.text.trim()) {
      return response.text.trim();
    }
  } catch {
    // .text can throw when the SDK only has thought parts or a blocked candidate.
  }

  const parts = response?.candidates?.[0]?.content?.parts || [];

  return parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function mongoReady() {
  return mongoose.connection.readyState === 1;
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    project: "TradeLens AI",
    mongo: mongoReady() ? "connected" : "disconnected",
  });
});

app.get("/api/stocks/:symbol/history", async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.params.symbol, 20);
    const candles = await fetchDailyCandles(symbol);

    res.json({
      symbol,
      interval: "1 day",
      count: candles.length,
      candles,
    });
  } catch (error) {
    console.error("Market data error:", error.message);
    sendError(res, error, "Failed to fetch market data");
  }
});

app.get("/api/stocks/:symbol/scan", async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.params.symbol);
    const candles = await fetchDailyCandles(symbol);
    res.json(buildScan(symbol, candles));
  } catch (error) {
    console.error("Scanner error:", error.message);
    sendError(res, error, "Failed to scan stock");
  }
});

app.get("/api/stocks/:symbol/backtest", async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.params.symbol);
    const candles = await fetchDailyCandles(symbol);
    const result = runBacktest(candles);
    res.json({ symbol, ...result });
  } catch (error) {
    console.error("Backtest error:", error.message);
    sendError(res, error, "Failed to run backtest");
  }
});

app.get("/api/stocks/:symbol/analyze", async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.params.symbol);
    const candles = await fetchDailyCandles(symbol);
    const scan = buildScan(symbol, candles);
    const backtest = runBacktest(candles);

    res.json({ scan, backtest });
  } catch (error) {
    console.error("Analyze error:", error.message);
    sendError(res, error, "Failed to analyze stock");
  }
});

app.post("/api/research", async (req, res) => {
  try {
    const { scan, backtest } = req.body;

    if (
      !scan ||
      !backtest ||
      typeof scan.symbol !== "string" ||
      !Number.isFinite(scan.latestClose) ||
      !Number.isFinite(backtest.totalReturnPercent) ||
      !Number.isFinite(backtest.totalTrades)
    ) {
      return res.status(400).json({
        error: "Valid scanner and backtest results are required.",
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API key is not configured.",
      });
    }

    const researchData = {
      symbol: scan.symbol,
      latestDate: scan.latestDate,
      latestClose: scan.latestClose,
      sma5: scan.sma5,
      signal: scan.signal,
      startingCapital: backtest.startingCapital,
      finalCapital: backtest.finalCapital,
      netProfit: backtest.netProfit,
      totalReturnPercent: backtest.totalReturnPercent,
      totalTrades: backtest.totalTrades,
      winRatePercent: backtest.winRatePercent,
      openPosition: backtest.openPosition,
      strategy: "5-day / 20-day SMA crossover",
    };

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Write a concise educational stock research report from this JSON data:
${JSON.stringify(researchData)}

Use these headings:
1. Data summary
2. SMA signal interpretation
3. Backtest performance
4. Limitations and next checks

Use only supplied figures. Do not invent market facts or recommend buying or selling. Mention that historical results do not predict future performance and that taxes and slippage are excluded. Keep the report under 350 words.`,
      config: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        thinkingConfig: {
          thinkingLevel: "minimal",
        },
      },
    });

    const report = extractGeminiText(response);
    const finishReason = response.candidates?.[0]?.finishReason;

    if (!report) {
      return res.status(502).json({
        error:
          finishReason === "MAX_TOKENS"
            ? "The report was cut off before any text was returned. Please retry."
            : "Gemini did not return a research report. Please retry.",
      });
    }

    res.json({
      symbol: scan.symbol,
      report,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Gemini research error:", error.message);

    res.status(502).json({
      error:
        "Could not generate research. Check your Gemini API access and try again.",
    });
  }
});

app.post("/api/agent", async (req, res) => {
  try {
    const { message } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Please enter a question.",
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API key is not configured.",
      });
    }

    const chat = ai.chats.create({
      model: GEMINI_MODEL,
      config: {
        tools: agentTools,
        temperature: 0.2,
      },
    });

    const firstResponse = await chat.sendMessage({
      message: message.trim(),
    });

    const functionCall = firstResponse.functionCalls?.[0];

    if (!functionCall) {
      return res.json({
        answer: firstResponse.text || "I couldn't generate a response.",
        toolUsed: null,
      });
    }

    const allowedTools = ["get_stock_analysis", "run_backtest"];

    if (!allowedTools.includes(functionCall.name)) {
      return res.status(400).json({
        error: "Requested tool is not allowed.",
      });
    }

    const symbol = normalizeSymbol(functionCall.args?.symbol || "");
    const candles = await fetchDailyCandles(symbol);
    const analysis = {
      scan: buildScan(symbol, candles),
      backtest: runBacktest(candles),
    };

    const toolResult =
      functionCall.name === "run_backtest"
        ? { symbol, backtest: analysis.backtest }
        : analysis;

    const finalResponse = await chat.sendMessage({
      message: [
        {
          functionResponse: {
            name: functionCall.name,
            response: {
              result: toolResult,
            },
          },
        },
      ],
    });

    const answer =
      finalResponse.text ||
      "The analysis was retrieved, but the explanation was empty.";

    let logId = null;

    if (mongoReady()) {
      try {
        const log = await AgentLog.create({
          question: message.trim(),
          symbol,
          toolUsed: functionCall.name,
          toolResult,
          answer,
        });
        logId = log._id;
      } catch (logError) {
        console.error("Agent log save failed:", logError.message);
      }
    }

    res.json({
      answer,
      toolUsed: functionCall.name,
      symbol,
      data: toolResult,
      logId,
    });
  } catch (error) {
    console.error("Agent error:", error.message);

    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    res.status(500).json({
      error: "The AI agent encountered an error. Please try again.",
    });
  }
});

app.get("/api/agent/logs", async (req, res) => {
  try {
    if (!mongoReady()) {
      return res.json([]);
    }

    const logs = await AgentLog.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json(logs);
  } catch (error) {
    console.error("Agent logs error:", error.message);

    res.status(500).json({
      error: "Could not retrieve agent logs.",
    });
  }
});

app.post("/api/knowledge/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({
        error: "Please provide a question.",
      });
    }

    if (question.length > 1000) {
      return res.status(400).json({
        error: "Question must be 1000 characters or fewer.",
      });
    }

    const documents = retrieveKnowledge(question.trim(), 3);

    if (documents.length === 0) {
      return res.json({
        answer:
          "I couldn't find relevant information in the current financial knowledge base. Try asking about drawdown, backtesting, moving averages, risk and return, win rate, or SMA crossover strategies.",
        sources: [],
        retrievedCount: 0,
      });
    }

    const context = documents
      .map(
        (doc, index) =>
          `[${index + 1}] ${doc.title}\n` +
          `Content: ${doc.content}\n` +
          `Source: ${doc.source}\n` +
          `URL: ${doc.url}`
      )
      .join("\n\n");

    const prompt = `
You are TradeLens AI, a financial education assistant.

Answer the user's question using the supplied retrieved context.
Do not invent facts or citations.
If the context does not answer part of the question, say so.
Cite supporting information using [1], [2], etc., matching the
document numbers below. Do not provide personalized investment advice.
Explain concepts clearly and concisely.

Retrieved context:
${context}

User question:
${question.trim()}
`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });

    res.json({
      answer: response.text || "No answer was generated from the retrieved sources.",
      sources: documents.map((doc, index) => ({
        citation: `[${index + 1}]`,
        title: doc.title,
        source: doc.source,
        url: doc.url,
      })),
      retrievedCount: documents.length,
    });
  } catch (error) {
    console.error("RAG error:", error);
    res.status(500).json({
      error: "Failed to generate a knowledge-based answer.",
    });
  }
});

const PORT = process.env.PORT || 5000;

function startServer() {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      console.log("MongoDB connected");
      startServer();
    })
    .catch((error) => {
      console.error("MongoDB connection failed:", error.message);
      console.warn("Starting without MongoDB. Agent activity logs will be unavailable.");
      startServer();
    });
} else {
  console.warn("MONGO_URI is not set. Starting without MongoDB.");
  startServer();
}
