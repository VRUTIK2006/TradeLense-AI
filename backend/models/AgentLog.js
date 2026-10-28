import mongoose from "mongoose";

const agentLogSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    toolUsed: {
      type: String,
      required: true,
      enum: ["get_stock_analysis", "run_backtest"],
    },
    toolResult: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    answer: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("AgentLog", agentLogSchema);