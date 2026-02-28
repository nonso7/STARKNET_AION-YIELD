"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { truncateAddress } from "@/lib/contracts";
import { Shield, Zap, LayoutDashboard, LogOut, Sparkles } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/deposit",   label: "Deposit",   icon: Zap },
  { href: "/withdraw",  label: "Withdraw",  icon: Shield },
  { href: "/ai",        label: "AI Advisor", icon: Sparkles },
];

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const isHome = pathname === "/";

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      background: isHome ? "rgba(13,14,18,0.85)" : "rgba(15,15,26,0.9)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>

        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg, #FC72FF, #9B00E8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={16} color="#fff" />
          </div>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>
            AION<span className="gradient-text-pink">Yield</span>
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 16px", borderRadius: 12,
                fontSize: 14, fontWeight: 600, textDecoration: "none",
                background: active ? "rgba(252,114,255,0.12)" : "transparent",
                color: active ? "#FC72FF" : "#94a3b8",
                transition: "all 0.2s",
              }}>
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </div>

        {/* Wallet */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isConnected && address ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00D4AA" }} />
                <span style={{ fontSize: 13, fontFamily: "monospace", color: "#cbd5e1" }}>{truncateAddress(address)}</span>
              </div>
              <button onClick={() => disconnect()} title="Disconnect"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", color: "#64748b", transition: "all 0.2s" }}>
                <LogOut size={15} />
              </button>
            </>
          ) : (
            <button onClick={() => connect({ connector: connectors[0] })}
              className="btn-primary animate-btn-pulse"
              style={{ padding: "10px 22px", borderRadius: 14, fontSize: 14, cursor: "pointer", border: "none" }}>
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
