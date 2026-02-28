"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Shield } from "lucide-react";

const inView = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0 },
};

const MARKETS = [
  {
    pair: "WBTC / USDC", price: "$64,230.50", change: "+2.4%", up: true,
    apy: "8.52%", tvl: "$12.4M",
    path: "M0 80 Q50 20 100 50 T200 30 T300 60 T400 10",
    color: "#FC72FF", gradId: "g1",
  },
  {
    pair: "STRK / USDC", price: "$0.4820", change: "-1.2%", up: false,
    apy: "12.1%", tvl: "$5.8M",
    path: "M0 20 Q50 60 100 30 T200 70 T300 40 T400 90",
    color: "#9B00E8", gradId: "g2",
  },
  {
    pair: "ETH / USDC", price: "$2,450.12", change: "+0.8%", up: true,
    apy: "5.4%", tvl: "$27.0M",
    path: "M0 90 Q50 70 100 80 T200 40 T300 50 T400 20",
    color: "#FC72FF", gradId: "g3",
  },
];

const STRATEGIES = [
  {
    icon: "🏦", name: "Vesu Lending", sub: "Decentralized money market",
    apy: "8.5%", color: "#FC72FF",
    perks: ["Low-risk collateralized lending", "Instant liquidity on Starknet", "Auto-compounding returns"],
  },
  {
    icon: "💧", name: "Ekubo LP", sub: "Concentrated liquidity",
    apy: "18.2%", color: "#9B00E8",
    perks: ["Optimized range management", "High-efficiency fee capture", "Dynamic fee tiering"],
  },
];

const STEPS = [
  { n: "01", color: "#FC72FF", title: "Generate Secret", desc: "Browser generates a random (secret, nullifier) pair that never leaves your device." },
  { n: "02", color: "#9B00E8", title: "Commit On-chain", desc: "Only the Poseidon commitment is stored on-chain. Your amount stays invisible." },
  { n: "03", color: "#00D4AA", title: "Prove & Withdraw", desc: "Reveal secret+nullifier to claim funds to any recipient address." },
];

export default function HomePage() {
  return (
    <div style={{ background: "#0D0E12", color: "#fff", fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>

      {/* ── HERO ─────────────────────────────────────────── */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {/* glow orbs */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(circle at 50% 0%, rgba(155,0,232,0.22) 0%, rgba(252,114,255,0.08) 40%, transparent 70%)" }} />
        <div style={{ position: "absolute", top: "30%", left: "5%", width: 500, height: 500, borderRadius: "50%", background: "rgba(252,114,255,0.06)", filter: "blur(120px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "20%", right: "5%", width: 400, height: 400, borderRadius: "50%", background: "rgba(155,0,232,0.08)", filter: "blur(100px)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "0 24px", textAlign: "center" }}>
          {/* badge */}
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
            style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
            <span className="badge-live">
              <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
                <span className="animate-ping-pink" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#FC72FF" }} />
                <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: "#FC72FF", display: "block" }} />
              </span>
              Live on Starknet Sepolia · ReDefine Hackathon 2026
            </span>
          </motion.div>

          {/* headline */}
          <motion.h1 initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            style={{ fontSize: "clamp(3rem,8vw,6rem)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 28 }}>
            Private{" "}
            <span className="gradient-text-pink">Bitcoin Yield</span>
            <br />on Starknet
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }}
            style={{ fontSize: "clamp(1rem,2vw,1.2rem)", color: "#94a3b8", maxWidth: 580, margin: "0 auto 48px", lineHeight: 1.7 }}>
            Deposit WBTC, earn optimized yield from Vesu &amp; Ekubo, and maintain full
            privacy with zero-knowledge infrastructure.
          </motion.p>

          {/* CTAs */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.38 }}
            style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 80 }}>
            <Link href="/ai" className="btn-primary animate-btn-pulse"
              style={{ padding: "16px 36px", borderRadius: 18, fontSize: 17, display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              Launch App <ArrowRight size={20} />
            </Link>
            <Link href="/dashboard" className="btn-ghost-white"
              style={{ padding: "16px 36px", borderRadius: 18, fontSize: 17, display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              View Dashboard
            </Link>
          </motion.div>

          {/* dashboard mockup */}
          <motion.div initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="animate-float" style={{ position: "relative", maxWidth: 820, margin: "0 auto" }}>
            {/* glow behind card */}
            <div style={{ position: "absolute", inset: -40, background: "rgba(252,114,255,0.1)", filter: "blur(60px)", borderRadius: 40, pointerEvents: "none" }} />
            <div className="glass-panel" style={{ borderRadius: 24, padding: 8, position: "relative" }}>
              {/* browser chrome */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", marginBottom: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(255,100,100,0.5)" }} />
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(255,200,80,0.5)" }} />
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(80,200,80,0.5)" }} />
                <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                  <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "3px 32px", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                    aion-yield.protocol/dashboard
                  </div>
                </div>
              </div>
              {/* mock stats */}
              <div style={{ background: "#0F0F1A", borderRadius: 18, padding: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                  {[
                    { label: "Total Value Locked", val: "$45.2M", dot: "#FC72FF" },
                    { label: "Blended APY", val: "13.4%", dot: "#9B00E8" },
                    { label: "Privacy Shield", val: "Active ✓", dot: "#00D4AA" },
                  ].map((s) => (
                    <div key={s.label} style={{ background: "#131316", borderRadius: 16, padding: 20, border: "1px solid #1F2030" }}>
                      <div style={{ width: 32, height: 32, borderRadius: 12, background: `${s.dot}22`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.dot }} />
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{s.val}</div>
                      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {/* sparkline */}
                <div style={{ background: "#131316", borderRadius: 16, padding: 20, border: "1px solid #1F2030", height: 120 }}>
                  <svg viewBox="0 0 800 80" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                    <defs>
                      <linearGradient id="hg" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#FC72FF" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#FC72FF" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0 60 Q100 20 200 40 T400 20 T600 35 T800 10 V80 H0Z" fill="url(#hg)" />
                    <path d="M0 60 Q100 20 200 40 T400 20 T600 35 T800 10"
                      fill="none" stroke="#FC72FF" strokeWidth="2.5" strokeLinecap="round"
                      className="animate-breathe-pink" />
                  </svg>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── LIVE MARKETS ─────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "100px 24px" }}>
        <motion.div variants={inView} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6 }}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48, flexWrap: "wrap", gap: 16 }}>
          <div>
            <h2 style={{ fontSize: "2.5rem", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 8 }}>Live Markets</h2>
            <p style={{ color: "#64748b" }}>Real-time yields across major Starknet protocols.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ padding: "6px 14px", borderRadius: 999, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}>Starknet Native</span>
            <span className="badge-zk">ZK-Protected</span>
          </div>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          {MARKETS.map((m, i) => (
            <motion.div key={m.pair} variants={inView} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6, delay: i * 0.1 }}>
              <div className="card-dark-hover" style={{ borderRadius: 28, padding: 28 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <p style={{ color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{m.pair}</p>
                    <h3 style={{ fontSize: "1.8rem", fontWeight: 900, letterSpacing: "-0.02em" }}>{m.price}</h3>
                  </div>
                  <span style={{ padding: "4px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: m.up ? "rgba(0,212,170,0.12)" : "rgba(255,69,96,0.12)", color: m.up ? "#00D4AA" : "#FF4560" }}>{m.change}</span>
                </div>
                <div style={{ height: 90, width: "100%", marginBottom: 20 }}>
                  <svg viewBox="0 0 400 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                    <defs>
                      <linearGradient id={m.gradId} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={m.color} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={m.color} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={`${m.path} V100 H0Z`} fill={`url(#${m.gradId})`} />
                    <path d={m.path} fill="none" stroke={m.color} strokeWidth="3" strokeLinecap="round" className="animate-breathe-pink" />
                  </svg>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 16, borderTop: "1px solid #1F2030", fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                  <span>APY: <span style={{ color: "#fff", fontSize: 14 }}>{m.apy}</span></span>
                  <span>TVL: <span style={{ color: "#fff", fontSize: 14 }}>{m.tvl}</span></span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── PROTOCOL STATS ───────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 100px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {[
            { label: "Total Value Locked", val: "$45.2M", accent: "#FC72FF" },
            { label: "24h Trading Volume", val: "$1.2M", accent: "#9B00E8" },
            { label: "Protocol Revenue", val: "$124k", accent: "#FC72FF" },
          ].map((s, i) => (
            <motion.div key={s.label} variants={inView} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.1 }}>
              <div className="card-dark-hover" style={{ borderRadius: 32, padding: 40 }}>
                <p style={{ color: "#64748b", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{s.label}</p>
                <h4 style={{ fontSize: "3rem", fontWeight: 900, letterSpacing: "-0.04em", color: "#fff" }}>{s.val}</h4>
                <div style={{ marginTop: 20, height: 3, width: 64, background: s.accent, borderRadius: 4 }} />
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── STRATEGIES ───────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 100px" }}>
        <motion.div variants={inView} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: "2.5rem", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 12 }}>Optimized Yield Strategies</h2>
          <p style={{ color: "#64748b", maxWidth: 480, margin: "0 auto" }}>Automatically route your WBTC to the highest-yielding protocols on Starknet.</p>
        </motion.div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
          {STRATEGIES.map((s, i) => (
            <motion.div key={s.name} variants={inView} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.12 }}>
              <div style={{ background: "#131316", border: "1px solid #1F2030", borderRadius: 28, padding: 36, transition: "border-color 0.25s", height: "100%", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 18, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{s.icon}</div>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>{s.name}</h3>
                    <p style={{ color: "#64748b", fontSize: 13 }}>{s.sub}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 28 }}>
                  <span style={{ fontSize: "3.2rem", fontWeight: 900, color: s.color, letterSpacing: "-0.04em" }}>{s.apy}</span>
                  <span style={{ color: "#64748b", fontWeight: 700 }}>APY</span>
                </div>
                <ul style={{ marginBottom: 32, flex: 1 }}>
                  {s.perks.map((p) => (
                    <li key={p} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, color: "#94a3b8", fontSize: 14 }}>
                      <CheckCircle2 size={15} color="#22c55e" /> {p}
                    </li>
                  ))}
                </ul>
                <Link href="/deposit" style={{ display: "block", textAlign: "center", padding: "14px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none", transition: "all 0.2s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = s.color; (e.currentTarget as HTMLElement).style.borderColor = s.color; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)"; }}>
                  Select Strategy
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 100px" }}>
        <motion.div variants={inView} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: "2.5rem", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 12 }}>How Private Deposits Work</h2>
          <p style={{ color: "#64748b" }}>Three steps. No one knows your position size. Not even the protocol.</p>
        </motion.div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 32 }}>
          {STEPS.map((s, i) => (
            <motion.div key={s.n} variants={inView} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.14 }}
              style={{ textAlign: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, background: `${s.color}18`, border: `1px solid ${s.color}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <span style={{ fontSize: 22, fontWeight: 900, fontFamily: "monospace", color: s.color }}>{s.n}</span>
              </div>
              <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 10, color: "#fff" }}>{s.title}</h3>
              <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.7 }}>{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 120px" }}>
        <motion.div variants={inView} initial="hidden" whileInView="show" viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <div style={{ padding: "2px", borderRadius: 40, background: "linear-gradient(135deg, #FC72FF, #9B00E8)" }}>
            <div style={{ background: "#0D0E12", borderRadius: 38, padding: "80px 40px", textAlign: "center" }}>
              <p style={{ color: "#FC72FF", fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>Private · Optimized · Yours</p>
              <h2 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 36 }}>Ready to earn private yield?</h2>
              <Link href="/ai" className="btn-primary animate-btn-pulse"
                style={{ padding: "18px 44px", borderRadius: 20, fontSize: 18, display: "inline-flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
                Launch Application <ArrowRight size={22} />
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid #1F2030", padding: "60px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 48, marginBottom: 48, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg, #FC72FF, #9B00E8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Shield size={16} color="#fff" />
              </div>
              <span style={{ fontSize: 20, fontWeight: 900 }}>AION<span className="gradient-text-pink">Yield</span></span>
            </div>
            <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.7, maxWidth: 280 }}>The premier private Bitcoin yield protocol on Starknet. Secure, private, and optimized.</p>
          </div>
          <div>
            <h5 style={{ color: "#fff", fontWeight: 800, marginBottom: 20, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>Protocol</h5>
            {["Documentation", "Whitepaper", "Security Audit", "Bug Bounty"].map(l => (
              <p key={l} style={{ marginBottom: 12 }}><a href="#" style={{ color: "#64748b", fontSize: 14, textDecoration: "none" }}>{l}</a></p>
            ))}
          </div>
          <div>
            <h5 style={{ color: "#fff", fontWeight: 800, marginBottom: 20, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>Community</h5>
            {["X / Twitter", "Discord", "Medium", "GitHub"].map(l => (
              <p key={l} style={{ marginBottom: 12 }}><a href="#" style={{ color: "#64748b", fontSize: 14, textDecoration: "none" }}>{l}</a></p>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: "0 auto", paddingTop: 32, borderTop: "1px solid #1F2030", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <p style={{ color: "#475569", fontSize: 13 }}>© 2026 AION Yield Protocol. All rights reserved.</p>
          <div style={{ display: "flex", gap: 24 }}>
            {["Privacy Policy", "Terms of Service"].map(l => (
              <a key={l} href="#" style={{ color: "#475569", fontSize: 13, textDecoration: "none" }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
