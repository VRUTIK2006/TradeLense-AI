
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import { retrieveKnowledge } from "./services/ragService.js";

const API_BASE = process.env.TRADELENS_API_URL || "http://localhost:5000/api";

async function getApiData(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `API request failed: ${response.status}`);
  }

  return data;
}

serveStdio(() => {
  const server = new McpServer({
    name: "tradelens-ai",
    version: "1.0.0",
  });

  // Tool 1: Get stock analysis from the existing backend
  server.registerTool(
    "get_stock_analysis",
    {
      description:
        "Get available historical stock analysis, moving-average scan, and backtest metrics for a supported ticker.",
      inputSchema: z.object({
        symbol: z.string().min(1).max(20),
      }),
    },
    async ({ symbol }) => {
      const ticker = symbol.trim().toUpperCase();

      if (!/^[A-Z0-9.-]{1,20}$/.test(ticker)) {
        return {
          content: [{ type: "text", text: "Invalid stock symbol." }],
          isError: true,
        };
      }

      try {
        const data = await getApiData(
          `/stocks/${encodeURIComponent(ticker)}/analyze`
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Stock analysis failed: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 2: Return backtest results from the existing analysis endpoint
  server.registerTool(
    "run_backtest",
    {
      description:
        "Retrieve historical backtest results for a supported stock symbol. This uses historical data, not live trading.",
      inputSchema: z.object({
        symbol: z.string().min(1).max(20),
      }),
    },
    async ({ symbol }) => {
      const ticker = symbol.trim().toUpperCase();

      if (!/^[A-Z0-9.-]{1,20}$/.test(ticker)) {
        return {
          content: [{ type: "text", text: "Invalid stock symbol." }],
          isError: true,
        };
      }

      try {
        const data = await getApiData(
          `/stocks/${encodeURIComponent(ticker)}/analyze`
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.backtest ?? data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Backtest retrieval failed: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 3: Search the local RAG knowledge base
  server.registerTool(
    "search_financial_knowledge",
    {
      description:
        "Retrieve relevant educational documents about drawdown, backtesting, moving averages, risk and return, win rate, and SMA strategies.",
      inputSchema: z.object({
        question: z.string().min(1).max(1000),
      }),
    },
    async ({ question }) => {
      const documents = retrieveKnowledge(question, 3);

      return {
        content: [
          {
            type: "text",
            text: documents.length
              ? JSON.stringify(
                  documents.map(({ id, title, content, source, url, score }) => ({
                    id, title, content, source, url, score,
                  })),
                  null,
                  2
                )
              : "No relevant knowledge documents found.",
          },
        ],
      };
    }
  );

  return server;
});
