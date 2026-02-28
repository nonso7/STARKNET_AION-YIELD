"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@starknet-react/core";
import { ChatMessage, TypingIndicator, type Message } from "@/components/ai/ChatMessage";
import { ChatInput } from "@/components/ai/ChatInput";
import { Sparkles, CheckCircle, ArrowLeft, Loader2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type FlowState =
  | "idle"             // No pending deposit — just chat
  | "analysing"        // Fetching APYs from chain
  | "awaiting_choice"  // Analysis done, user picks strategy
  | "awaiting_confirm" // User picked, waiting for final confirm
  | "simulating"       // Calling /api/simulate-yield
  | "done";            // Simulation complete

interface AnalysisData {
  amount: string;
  depositTxHash: string;
  mode: string;
  chosen: string;       // "vesu" | "ekubo" — AI's recommendation
  chosenLabel: string;
  chosenApy: string;
  otherStrategy: string;
  otherLabel: string;
  otherApy: string;
}

// ── Welcome message ────────────────────────────────────────────────────────
const WELCOME: Message = {
  role: "assistant",
  content: `**Welcome to the AION Yield AI Advisor!**

I analyse both yield strategies in real time and route your deposit to the best one.

**How it works:**
- Deposit WBTC on the **Deposit** tab
- I read live APY from both Vesu Lending and Ekubo LP
- I recommend the higher-yield strategy — you make the final call
- Confirm and I simulate the full on-chain deposit

Make a deposit to see AI routing in action, or ask me anything below.`,
};

export default function AIAdvisorPage() {
  const { isConnected, address } = useAccount();
  const router = useRouter();

  // ── Chat state ─────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── AI routing flow state ──────────────────────────────────────────────
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [userChoice, setUserChoice] = useState<{ strategy: string; label: string; apy: string } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, flowState]);

  // ── Auto-analyse immediately after deposit redirect ────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem("aion_pending_deposit");
    if (!raw) return;
    sessionStorage.removeItem("aion_pending_deposit");

    let pending: { amount: string; txHash: string; mode: string };
    try {
      pending = JSON.parse(raw);
    } catch {
      return;
    }

    const { amount, txHash, mode } = pending;

    const userMsg: Message = {
      role: "user",
      content: `I just made a ${mode} deposit of **${amount} WBTC** (tx: \`${txHash}\`). Which yield strategy should I use?`,
    };
    const history = [WELCOME, userMsg];
    setMessages([...history, { role: "assistant", content: "" }]);
    setFlowState("analysing");

    const run = async () => {
      try {
        const res = await fetch("/api/ai-deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Analysis failed");

        // Derive the "other" strategy fields
        const otherStrategy = data.chosen === "vesu" ? "ekubo" : "vesu";
        const otherLabel    = data.chosen === "vesu" ? "Ekubo LP" : "Vesu Lending";
        const otherApy      = data.otherApy;

        setAnalysis({
          amount,
          depositTxHash: txHash,
          mode,
          chosen: data.chosen,
          chosenLabel: data.chosenLabel,
          chosenApy: data.chosenApy,
          otherStrategy,
          otherLabel,
          otherApy,
        });

        const reasoning =
          `**Deposit received:** \`${txHash}\`\n` +
          `**Amount:** ${amount} WBTC · **Mode:** ${mode === "private" ? "🔒 Private" : "⚡ Public"}\n\n` +
          `---\n\n` +
          data.reasoning +
          `\n\n---\n\n**Choose your strategy below, or override my recommendation.**`;

        setMessages([...history, { role: "assistant", content: reasoning }]);
        setFlowState("awaiting_choice");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Analysis failed";
        setMessages([
          ...history,
          { role: "assistant", content: `❌ **Analysis failed:** ${msg}` },
        ]);
        setFlowState("idle");
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Step 2: User picks a strategy ─────────────────────────────────────
  const handleChooseStrategy = (strategy: string, label: string, apy: string) => {
    if (!analysis) return;
    setUserChoice({ strategy, label, apy });

    const isAiPick = strategy === analysis.chosen;
    const confirmMsg: Message = {
      role: "assistant",
      content:
        `${isAiPick ? "✅ Great choice — that matches my recommendation!" : "👍 Noted — overriding to your preferred strategy."}\n\n` +
        `I'm ready to deposit **${analysis.amount} WBTC** into **${label}** at **${apy} APY**.\n\n` +
        `Shall I go ahead?`,
    };
    setMessages((prev) => [...prev, confirmMsg]);
    setFlowState("awaiting_confirm");
  };

  // ── Step 3: Confirm → simulate deposit ────────────────────────────────
  const handleConfirm = async () => {
    if (!analysis || !userChoice) return;
    setFlowState("simulating");

    const proceedMsg: Message = {
      role: "user",
      content: `Yes, deposit ${analysis.amount} WBTC to ${userChoice.label}.`,
    };
    setMessages((prev) => [...prev, proceedMsg, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/simulate-yield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: userChoice.strategy, amount: analysis.amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Simulation failed");

      const resultMsg =
        `## ✅ Deposit Simulated\n\n` +
        `| Field | Value |\n` +
        `|---|---|\n` +
        `| Strategy | **${data.strategyLabel}** |\n` +
        `| Amount | **${data.amount} WBTC** |\n` +
        `| APY | **${data.apyFormatted}** |\n` +
        `| Simulated Tx | \`${data.txHash}\` |\n` +
        `| Block | \`${data.block}\` |\n\n` +
        `**Projected yield:**\n` +
        `- 30 days → **${data.yield30d} WBTC**\n` +
        `- 90 days → **${data.yield90d} WBTC**\n` +
        `- 1 year  → **${data.yield1y} WBTC**\n\n` +
        `Your funds are now earning yield on ${data.strategyLabel}. Check your position on the Dashboard.`;

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: resultMsg };
        return updated;
      });
      setFlowState("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Simulation failed";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: `❌ **Simulation failed:** ${msg}` };
        return updated;
      });
      setFlowState("done");
    }
  };

  // ── Step 3 (cancel): Go back to choice ────────────────────────────────
  const handleCancel = () => {
    setUserChoice(null);
    setFlowState("awaiting_choice");
    const cancelMsg: Message = {
      role: "assistant",
      content: "No problem — choose your preferred strategy below.",
    };
    setMessages((prev) => [...prev, cancelMsg]);
  };

  // ── AI general chat ───────────────────────────────────────────────────
  const sendMessage = async (content: string) => {
    if (isLoading || flowState === "analysing" || flowState === "simulating") return;
    const userMsg: Message = { role: "user", content };
    const history = [...messages, userMsg];
    setMessages(history);
    setIsLoading(true);
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((m) => m.role !== "assistant" || m.content)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) throw new Error("API error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: accumulated }]);
      }

      if (!accumulated) {
        setMessages([
          ...history,
          {
            role: "assistant",
            content:
              "⚠️ **AI chat requires Anthropic credits.**\n\nAdd credits at [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing).",
          },
        ]);
      }
    } catch {
      setMessages([
        ...history,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const isBusy = isLoading || flowState === "analysing" || flowState === "simulating";

  return (
    <div className="min-h-screen bg-aion-dark flex flex-col pt-[72px]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="border-b border-aion-border glass-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-aion-gold to-aion-accent flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-aion-text font-bold text-sm">AION AI Advisor</h1>
            <p className="text-aion-muted text-xs">Powered by Claude · Yield Routing</p>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${
            isConnected
              ? "border-aion-green/30 bg-aion-green/10 text-aion-green"
              : "border-aion-border bg-aion-card text-aion-muted"
          }`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? "bg-aion-green animate-pulse" : "bg-aion-muted"
            }`}
          />
          {isConnected
            ? `${address?.slice(0, 6)}...${address?.slice(-4)}`
            : "Wallet not connected"}
        </div>
      </div>

      {/* ── Chat messages ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-3xl mx-auto w-full bg-dot-grid">
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {isBusy && messages[messages.length - 1]?.content === "" && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* ── Contextual action panel ─────────────────────────────────────── */}
      {(flowState === "awaiting_choice" || flowState === "awaiting_confirm" || flowState === "simulating") && analysis && (
        <div className="border-t border-aion-border/40 max-w-3xl mx-auto w-full px-4 py-3">
          <div className="glass-card border border-aion-border rounded-xl p-4">

            {/* STEP: Choose strategy */}
            {flowState === "awaiting_choice" && (
              <div>
                <p className="text-xs text-aion-muted mb-3 font-medium tracking-wide uppercase">
                  Choose your yield strategy for {analysis.amount} WBTC
                </p>
                <div className="flex gap-3">
                  {/* AI-recommended strategy */}
                  <button
                    onClick={() =>
                      handleChooseStrategy(analysis.chosen, analysis.chosenLabel, analysis.chosenApy)
                    }
                    className="flex-1 btn-gold rounded-xl py-3 px-4 text-sm flex flex-col items-center gap-1"
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Sparkles size={13} />
                      {analysis.chosenLabel}
                    </span>
                    <span className="text-xs opacity-80">{analysis.chosenApy} · AI Pick ✅</span>
                  </button>

                  {/* Other strategy */}
                  <button
                    onClick={() =>
                      handleChooseStrategy(analysis.otherStrategy, analysis.otherLabel, analysis.otherApy)
                    }
                    className="flex-1 btn-outline rounded-xl py-3 px-4 text-sm flex flex-col items-center gap-1"
                  >
                    <span className="font-semibold">{analysis.otherLabel}</span>
                    <span className="text-xs text-aion-muted">{analysis.otherApy}</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP: Confirm chosen strategy */}
            {flowState === "awaiting_confirm" && userChoice && (
              <div>
                <p className="text-xs text-aion-muted mb-3 font-medium tracking-wide uppercase">
                  Confirm deposit to {userChoice.label}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleConfirm}
                    className="flex-1 btn-gold rounded-xl py-3 text-sm flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={15} />
                    Yes — deposit {analysis.amount} WBTC at {userChoice.apy}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="btn-outline rounded-xl py-3 px-4 text-sm flex items-center gap-1.5"
                  >
                    <ArrowLeft size={14} />
                    Change
                  </button>
                </div>
              </div>
            )}

            {/* STEP: Simulating */}
            {flowState === "simulating" && (
              <div className="flex items-center justify-center gap-3 py-2 text-aion-muted text-sm">
                <Loader2 size={16} className="animate-spin text-aion-gold" />
                Simulating deposit on-chain…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Done — offer to deposit again */}
      {flowState === "done" && (
        <div className="border-t border-aion-border/40 max-w-3xl mx-auto w-full px-4 py-3">
          <button
            onClick={() => router.push("/deposit")}
            className="w-full btn-outline rounded-xl py-2.5 text-sm"
          >
            Make another deposit →
          </button>
        </div>
      )}

      {/* ── Chat input ──────────────────────────────────────────────────── */}
      <div className="border-t border-aion-border glass-card px-4 py-4">
        <div className="max-w-3xl mx-auto">
          {!isConnected && (
            <div className="mb-3 text-xs text-center badge-gold mx-auto inline-flex w-full justify-center">
              Connect your wallet to use AI yield routing
            </div>
          )}
          <ChatInput
            onSend={sendMessage}
            isLoading={isBusy}
            isConnected={isConnected}
          />
        </div>
      </div>
    </div>
  );
}
