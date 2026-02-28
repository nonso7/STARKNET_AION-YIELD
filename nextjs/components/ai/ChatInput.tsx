"use client";

import { useState, KeyboardEvent } from "react";

const QUICK_ACTIONS = [
  { label: "How does AION work?", prompt: "Explain how AION Yield works in simple terms." },
  { label: "Best yield strategy", prompt: "What's the best yield strategy on AION right now — Vesu or Ekubo?" },
  { label: "Private deposit guide", prompt: "How do I deposit privately? Explain the privacy mode step by step." },
  { label: "How to withdraw", prompt: "How do I withdraw my WBTC from AION Yield?" },
];

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  isConnected: boolean;
}

export function ChatInput({ onSend, isLoading, isConnected }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || isLoading) return;
    onSend(msg);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-3">
      {/* Quick action chips */}
      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => onSend(action.prompt)}
            disabled={isLoading}
            className="text-xs px-3 py-1.5 rounded-full glass-card border border-aion-border
              hover:border-aion-gold/40 hover:bg-aion-gold/10 hover:text-aion-gold
              text-aion-muted transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className="flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={1}
          placeholder={
            isConnected
              ? "Ask about yield strategies, privacy, deposits..."
              : "Connect wallet to unlock personalized advice..."
          }
          className="aion-input flex-1 resize-none px-4 py-3 text-sm max-h-32"
          style={{ height: "auto" }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = Math.min(t.scrollHeight, 128) + "px";
          }}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="flex-shrink-0 h-11 w-11 rounded-xl btn-gold
            flex items-center justify-center transition-all duration-200
            disabled:opacity-40 disabled:cursor-not-allowed disabled:box-shadow-none"
        >
          {isLoading ? (
            <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
      <p className="text-xs text-aion-muted/50 text-center">
        Shift+Enter for new line · Enter to send
      </p>
    </div>
  );
}
