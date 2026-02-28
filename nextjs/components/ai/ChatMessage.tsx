"use client";

import { truncateAddress } from "@/lib/contracts";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

function formatContent(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // Heading (## text)
    if (line.startsWith("## ")) {
      return (
        <p key={i} className="font-bold text-aion-text text-sm mt-3 mb-1">
          {line.slice(3)}
        </p>
      );
    }

    // Bullet point
    if (line.startsWith("- ") || line.startsWith("• ")) {
      const content = line.startsWith("- ") ? line.slice(2) : line.slice(2);
      const parts = content.split(/\*\*(.*?)\*\*/g);
      return (
        <div key={i} className="flex gap-2 my-0.5 ml-1">
          <span className="text-aion-gold mt-1 shrink-0">▸</span>
          <span>
            {parts.map((p, j) =>
              j % 2 === 1 ? (
                <strong key={j} className="text-aion-gold font-semibold">
                  {p}
                </strong>
              ) : (
                p
              )
            )}
          </span>
        </div>
      );
    }

    // Empty line
    if (!line.trim()) return <br key={i} />;

    // Normal line with bold (**text**)
    const parts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <p key={i} className="my-0.5 leading-relaxed">
        {parts.map((p, j) =>
          j % 2 === 1 ? (
            <strong key={j} className="text-aion-gold font-semibold">
              {p}
            </strong>
          ) : (
            // Replace 0x addresses inline
            p.replace(/(0x[0-9a-fA-F]{10,})/g, (addr) => truncateAddress(addr))
          )
        )}
      </p>
    );
  });
}

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-bold
          ${
            isUser
              ? "bg-gradient-to-br from-aion-gold to-orange-700 text-white"
              : "bg-gradient-to-br from-aion-accent to-indigo-700 text-white"
          }`}
      >
        {isUser ? "You" : "AI"}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
          ${
            isUser
              ? "bg-aion-gold/15 border border-aion-gold/25 text-aion-text rounded-tr-sm"
              : "glass-card border border-aion-border text-aion-text rounded-tl-sm"
          }`}
      >
        {formatContent(message.content)}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-bold bg-gradient-to-br from-aion-accent to-indigo-700 text-white">
        AI
      </div>
      <div className="glass-card border border-aion-border rounded-2xl rounded-tl-sm px-4 py-3.5 flex gap-1.5 items-center">
        <span className="w-2 h-2 rounded-full bg-aion-accent animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-aion-accent animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-aion-accent animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
