"use client";

import { motion } from "framer-motion";
import { useAccount } from "@starknet-react/core";
import { useVaultStats } from "@/hooks/useAionVault";
import { loadAllNotes } from "@/lib/privacy";
import { formatWBTC } from "@/lib/contracts";
import {
  TrendingUp, Shield, Zap, Bitcoin,
  Lock, Eye, EyeOff, ExternalLink, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { PrivateNote } from "@/lib/privacy";

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const {
    tvlFormatted, apyFormatted, apyBps,
    sharesFormatted, wbtcBalanceFormatted, shares, wbtcBalance,
  } = useVaultStats();

  const [privateNotes, setPrivateNotes] = useState<PrivateNote[]>([]);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setPrivateNotes(loadAllNotes());
  }, []);

  const totalPrivateValue = privateNotes.reduce((a, n) => a + n.amount, 0n);
  const vesuApy = (apyBps * 0.6 / 100).toFixed(2);
  const ekuboApy = (apyBps * 0.4 / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-aion-dark pt-28 pb-10 px-4">
      <div className="max-w-6xl mx-auto">

        {/* ── Header ───────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex items-end justify-between"
        >
          <div>
            <div className="badge-purple mb-3 inline-flex">Live Data</div>
            <h1 className="text-4xl font-extrabold text-aion-text">Dashboard</h1>
            <p className="text-aion-muted mt-1 text-sm">
              Protocol statistics and your AION Yield positions
            </p>
          </div>
          <button className="p-2.5 rounded-xl glass-card border border-aion-border text-aion-muted hover:text-aion-text transition-all">
            <RefreshCw size={16} />
          </button>
        </motion.div>

        {/* ── Protocol Stats ──────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            {
              label: "Total Value Locked",
              value: `${tvlFormatted} WBTC`,
              icon: Bitcoin,
              color: "text-aion-gold",
              bg: "bg-aion-gold/10",
              border: "border-aion-gold/20",
              glow: "glow-gold",
              sub: "Across Vesu + Ekubo",
            },
            {
              label: "Blended APY",
              value: apyFormatted,
              icon: TrendingUp,
              color: "text-aion-green",
              bg: "bg-aion-green/10",
              border: "border-aion-green/20",
              glow: "glow-green",
              sub: `Vesu ${vesuApy}% + Ekubo ${ekuboApy}%`,
            },
            {
              label: "Privacy Shield",
              value: "Active",
              icon: Shield,
              color: "text-aion-accent",
              bg: "bg-aion-accent/10",
              border: "border-aion-accent/20",
              glow: "privacy-glow",
              sub: "Poseidon commitments",
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i }}
              className={`glass-card rounded-2xl p-6 border ${stat.border} ${stat.glow}`}
            >
              <div className={`w-11 h-11 ${stat.bg} rounded-xl flex items-center justify-center mb-5`}>
                <stat.icon size={20} className={stat.color} />
              </div>
              <div className={`text-2xl font-bold ${stat.color} mb-1`}>{stat.value}</div>
              <div className="text-aion-text text-sm font-semibold">{stat.label}</div>
              <div className="text-aion-muted text-xs mt-1">{stat.sub}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Strategy Allocation ─────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card rounded-2xl p-6 border border-aion-border mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-aion-text">Strategy Allocation</h2>
            <span className="badge-green">Auto-rebalancing</span>
          </div>

          <div className="space-y-5">
            {[
              { label: "Vesu Lending", pct: 60, color: "bg-aion-gold", textColor: "text-aion-gold", apy: vesuApy },
              { label: "Ekubo LP", pct: 40, color: "bg-aion-accent", textColor: "text-aion-accent", apy: ekuboApy },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex justify-between items-center text-sm mb-2">
                  <span className="text-aion-text flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${row.color}`} />
                    {row.label}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-aion-muted text-xs">{row.apy}% APY</span>
                    <span className={`font-mono font-semibold ${row.textColor}`}>{row.pct}%</span>
                  </div>
                </div>
                <div className="h-2.5 bg-aion-border rounded-full overflow-hidden">
                  <div
                    className={`h-full ${row.color} rounded-full transition-all duration-700`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-aion-muted text-xs mt-4">
            Allocation auto-rebalances every hour if drift exceeds 5%
          </p>
        </motion.div>

        {/* ── User Positions ──────────────────────────────────── */}
        {isConnected ? (
          <div className="grid md:grid-cols-2 gap-5 mb-8">
            {/* Public Position */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 }}
              className="glass-card rounded-2xl p-6 border border-aion-gold/30 glow-gold"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-aion-gold/10 rounded-xl flex items-center justify-center">
                  <Zap size={17} className="text-aion-gold" />
                </div>
                <div>
                  <h3 className="font-semibold text-aion-text">Public Position</h3>
                  <p className="text-aion-muted text-xs">Standard ERC-4626 shares</p>
                </div>
              </div>

              <div className="space-y-3 mb-5">
                {[
                  { label: "WBTC Balance", value: `${wbtcBalanceFormatted} WBTC`, color: "text-aion-gold" },
                  { label: "aionWBTC Shares", value: sharesFormatted, color: "text-aion-text" },
                  { label: "Est. Value", value: `${formatWBTC(shares)} WBTC`, color: "text-aion-gold", bold: true },
                ].map((row) => (
                  <div key={row.label} className={`flex justify-between items-center ${row.bold ? "pt-3 border-t border-aion-border" : ""}`}>
                    <span className="text-aion-muted text-sm">{row.label}</span>
                    <span className={`font-mono text-sm ${row.bold ? "font-bold" : ""} ${row.color}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <Link
                href="/deposit"
                className="w-full btn-gold rounded-xl py-2.5 text-sm text-center block"
              >
                Deposit More
              </Link>
            </motion.div>

            {/* Private Positions */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.42 }}
              className="glass-card rounded-2xl p-6 border border-aion-accent/30 privacy-glow"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-aion-accent/10 rounded-xl flex items-center justify-center">
                    <Lock size={17} className="text-aion-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-aion-text">Private Notes</h3>
                    <p className="text-aion-muted text-xs">ZK commitment positions</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="p-2 rounded-lg glass-card border border-aion-border text-aion-muted hover:text-aion-text transition-all"
                  title={showSecrets ? "Hide" : "Reveal"}
                >
                  {showSecrets ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {privateNotes.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-aion-border/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Lock size={20} className="text-aion-muted opacity-40" />
                  </div>
                  <p className="text-aion-muted text-sm mb-1">No private notes found</p>
                  <Link href="/deposit" className="text-aion-accent text-sm hover:underline">
                    Create private deposit →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2 mb-5">
                  {privateNotes.slice(0, 3).map((note, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center py-2.5 px-3 rounded-xl bg-aion-card2 border border-aion-border"
                    >
                      <div>
                        <div className="font-mono text-xs text-aion-muted">
                          {note.commitment.slice(0, 12)}...
                        </div>
                        <div className="text-xs text-aion-muted/60 mt-0.5">
                          {new Date(note.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        {showSecrets ? (
                          <span className="font-mono text-aion-accent text-sm font-semibold">
                            {formatWBTC(note.amount)} WBTC
                          </span>
                        ) : (
                          <span className="font-mono text-aion-muted text-sm tracking-widest">
                            ••••••
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {showSecrets && (
                    <div className="pt-2.5 flex justify-between border-t border-aion-border">
                      <span className="text-aion-muted text-sm">Total</span>
                      <span className="font-mono font-bold text-aion-accent">
                        {formatWBTC(totalPrivateValue)} WBTC
                      </span>
                    </div>
                  )}
                </div>
              )}

              <Link
                href="/withdraw"
                className="w-full btn-purple rounded-xl py-2.5 text-sm text-center block"
              >
                Withdraw Privately
              </Link>
            </motion.div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card rounded-2xl p-14 text-center border border-aion-border mb-8"
          >
            <div className="w-16 h-16 bg-aion-border/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield size={28} className="text-aion-muted opacity-40" />
            </div>
            <h3 className="text-lg font-semibold text-aion-text mb-2">
              Connect Wallet to View Positions
            </h3>
            <p className="text-aion-muted text-sm">
              Connect your ArgentX or Braavos wallet to see your yield positions.
            </p>
          </motion.div>
        )}

        {/* ── Ecosystem Links ─────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "AVNU Exchange", href: "https://app.avnu.fi", color: "text-blue-400", border: "border-blue-400/20" },
            { label: "Vesu Protocol", href: "https://vesu.xyz", color: "text-green-400", border: "border-green-400/20" },
            { label: "Ekubo Pools", href: "https://ekubo.org", color: "text-aion-accent", border: "border-aion-accent/20" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`glass-card glass-card-hover rounded-xl p-3.5 text-center text-sm flex items-center justify-center gap-1.5 border ${link.border}`}
            >
              <span className={link.color + " font-medium text-xs"}>{link.label}</span>
              <ExternalLink size={11} className="text-aion-muted" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
