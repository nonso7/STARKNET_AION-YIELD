import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        aion: {
          gold:    "#F7931A",
          dark:    "#0A0A0F",
          card:    "#12121A",
          border:  "#1E1E2E",
          accent:  "#6C63FF",
          green:   "#00D4AA",
          red:     "#FF4444",
          muted:   "#4A4A6A",
          text:    "#E0E0F0",
        },
        // Landing page Uniswap-style palette
        pink:    { DEFAULT: "#FC72FF", dark: "#9B00E8" },
        surface: { DEFAULT: "#131316", deep: "#0D0E12", card: "#16171D" },
        line:    { DEFAULT: "#1F2030" },
      },
      fontFamily: {
        mono:    ["'JetBrains Mono'", "monospace"],
        sans:    ["'Public Sans'", "Inter", "sans-serif"],
        display: ["'Public Sans'", "Inter", "sans-serif"],
      },
      maxWidth: {
        "8xl": "1440px",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      animation: {
        "pulse-slow":  "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer:       "shimmer 2s linear infinite",
        "fade-in":     "fadeIn 0.5s ease-in-out",
        float:         "float 6s ease-in-out infinite",
        "btn-pulse":   "btnPulse 2.5s ease infinite",
        "ping-pink":   "pingPink 1.4s cubic-bezier(0,0,0.2,1) infinite",
        "breathe":     "breathe 3s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeIn: {
          "0%":   { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%":     { transform: "translateY(-10px)" },
        },
        btnPulse: {
          "0%":   { boxShadow: "0 0 0 0 rgba(252,114,255,0.5)" },
          "70%":  { boxShadow: "0 0 0 14px rgba(252,114,255,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(252,114,255,0)" },
        },
        pingPink: {
          "0%":   { transform: "scale(1)", opacity: "0.8" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        breathe: {
          "0%,100%": { filter: "drop-shadow(0 0 3px rgba(252,114,255,0.5))" },
          "50%":     { filter: "drop-shadow(0 0 10px rgba(252,114,255,0.85))" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
