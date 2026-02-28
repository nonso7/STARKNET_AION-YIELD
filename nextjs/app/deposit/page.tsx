"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "@starknet-react/core";
import { usePublicDeposit, usePrivateDeposit, useVaultStats } from "@/hooks/useAionVault";
import { Lock, Zap, Copy, Check, AlertTriangle, Download, Bitcoin, Shield, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { type PrivateNote } from "@/lib/privacy";
import { formatWBTC } from "@/lib/contracts";

type Mode = "public" | "private";
type Step = "input" | "confirm" | "pending" | "success";

export default function DepositPage() {
  const { isConnected } = useAccount();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("private");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [savedNote, setSavedNote] = useState<PrivateNote | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { tvlFormatted, apyFormatted, wbtcBalanceFormatted } = useVaultStats();
  const { deposit: publicDeposit, isLoading: pubLoading } = usePublicDeposit();
  const { depositPrivate, isLoading: privLoading } = usePrivateDeposit();

  const isLoading = pubLoading || privLoading;

  const handleCopy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setStep("pending");
    try {
      if (mode === "public") {
        const result = await publicDeposit(amount);
        setTxHash(result.transaction_hash);
      } else {
        const { result, note } = await depositPrivate(amount);
        setTxHash(result.transaction_hash);
        setSavedNote(note);
      }
      setStep("success");
      toast.success(mode === "private" ? "Private deposit successful!" : "Deposit successful!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      toast.error(msg);
      setStep("input");
    }
  };

  const downloadNote = () => {
    if (!savedNote) return;
    const content = JSON.stringify(
      savedNote,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2
    );
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aion-note-${savedNote.commitment.slice(2, 10)}.json`;
    a.click();
    setNoteSaved(true);
    toast.success("Note downloaded! Keep it safe.");
  };

  const reset = () => {
    setStep("input");
    setAmount("");
    setSavedNote(null);
    setNoteSaved(false);
    setTxHash("");
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-aion-dark flex items-center justify-center px-4">
        <div className="glass-card rounded-2xl p-14 text-center max-w-md border border-aion-border glow-gold">
          <div className="w-16 h-16 bg-aion-gold/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Bitcoin size={28} className="text-aion-gold opacity-70" />
          </div>
          <h2 className="text-xl font-bold text-aion-text mb-2">Connect Your Wallet</h2>
          <p className="text-aion-muted text-sm">Connect ArgentX or Braavos to deposit.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-aion-dark pt-28 pb-10 px-4">
      <div className="max-w-xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="badge-gold mb-3 inline-flex">WBTC Deposit</div>
          <h1 className="text-4xl font-extrabold text-aion-text">Deposit</h1>
          <p className="text-aion-muted mt-1 text-sm">Deposit WBTC and start earning yield privately.</p>
        </motion.div>

        {/* Vault info strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card rounded-xl px-5 py-3.5 border border-aion-border mb-6 flex items-center justify-between"
        >
          <div className="text-xs text-aion-muted">
            TVL <span className="text-aion-gold font-mono font-semibold ml-1">{tvlFormatted} WBTC</span>
          </div>
          <div className="w-px h-4 bg-aion-border" />
          <div className="text-xs text-aion-muted">
            APY <span className="text-aion-green font-mono font-semibold ml-1">{apyFormatted}</span>
          </div>
          <div className="w-px h-4 bg-aion-border" />
          <div className="text-xs text-aion-muted">
            Balance{" "}
            <span className="text-aion-text font-mono font-semibold ml-1">{wbtcBalanceFormatted}</span>
          </div>
        </motion.div>

        {/* Main card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-2xl p-6 border border-aion-border"
        >
          <AnimatePresence mode="wait">
            {/* ── Input Step ─────────────────────────────────── */}
            {step === "input" && (
              <motion.div
                key="input"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Mode Toggle */}
                <div className="tab-group mb-6">
                  {(["private", "public"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={clsx(
                        "tab-item flex items-center justify-center gap-2",
                        mode === m ? (m === "private" ? "active-purple" : "active-gold") : ""
                      )}
                    >
                      {m === "private" ? <Lock size={13} /> : <Zap size={13} />}
                      {m === "private" ? "Private" : "Public"}
                    </button>
                  ))}
                </div>

                {/* Mode description */}
                <div
                  className={clsx(
                    "rounded-xl p-4 mb-5 text-sm",
                    mode === "private"
                      ? "bg-aion-accent/8 border border-aion-accent/25 text-aion-accent"
                      : "bg-aion-gold/8 border border-aion-gold/25 text-aion-gold"
                  )}
                >
                  {mode === "private" ? (
                    <div className="flex gap-2">
                      <Shield size={15} className="shrink-0 mt-0.5" />
                      <span>
                        Your deposit amount is hidden on-chain. A Poseidon commitment is stored instead.
                        You&apos;ll receive a private note — keep it safe to withdraw later.
                      </span>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Zap size={15} className="shrink-0 mt-0.5" />
                      <span>
                        Standard ERC-4626 deposit. Your position (amount, address) is visible on-chain.
                        You receive aionWBTC shares proportional to your deposit.
                      </span>
                    </div>
                  )}
                </div>

                {/* Amount input */}
                <label className="block text-xs text-aion-muted mb-2 font-medium tracking-wide uppercase">
                  Amount (WBTC)
                </label>
                <div className="relative mb-5">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="0.00000000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="aion-input w-full px-4 py-3.5 pr-24 text-lg"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <button
                      onClick={() => setAmount(wbtcBalanceFormatted)}
                      className="text-xs text-aion-accent hover:text-aion-accent/80 font-semibold"
                    >
                      MAX
                    </button>
                    <span className="text-aion-muted text-xs font-mono">WBTC</span>
                  </div>
                </div>

                <button
                  onClick={handleDeposit}
                  disabled={!amount || parseFloat(amount) <= 0}
                  className={clsx(
                    "w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2",
                    mode === "private" ? "btn-purple" : "btn-gold"
                  )}
                >
                  {mode === "private" ? (
                    <>
                      <Lock size={15} /> Deposit Privately
                    </>
                  ) : (
                    <>
                      <Zap size={15} /> Deposit
                    </>
                  )}
                </button>
              </motion.div>
            )}

            {/* ── Pending Step ───────────────────────────────── */}
            {step === "pending" && (
              <motion.div
                key="pending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-10"
              >
                <div className="w-16 h-16 rounded-full border-4 border-aion-accent border-t-transparent animate-spin mx-auto mb-5" />
                <h3 className="text-lg font-semibold text-aion-text mb-2">
                  {mode === "private" ? "Creating Private Position..." : "Depositing..."}
                </h3>
                <p className="text-aion-muted text-sm">
                  {mode === "private"
                    ? "Generating commitment and submitting transaction..."
                    : "Approving WBTC and depositing into vault..."}
                </p>
              </motion.div>
            )}

            {/* ── Success Step ───────────────────────────────── */}
            {step === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-aion-green/15 border border-aion-green/30 flex items-center justify-center mx-auto mb-4">
                    <Check size={28} className="text-aion-green" />
                  </div>
                  <h3 className="text-xl font-bold text-aion-text">
                    {mode === "private" ? "Privately Deposited!" : "Deposited!"}
                  </h3>
                  <p className="text-aion-muted text-sm mt-1">{amount} WBTC is now earning yield</p>
                </div>

                {txHash && (
                  <div className="bg-aion-card2 border border-aion-border rounded-xl p-3 flex items-center justify-between">
                    <span className="text-xs text-aion-muted font-mono">{txHash.slice(0, 22)}...</span>
                    <button
                      onClick={() => handleCopy(txHash, "tx")}
                      className="text-aion-accent hover:text-aion-accent/80 transition-colors"
                    >
                      {copied === "tx" ? (
                        <Check size={14} className="text-aion-green" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
                )}

                {mode === "private" && savedNote && (
                  <div className="bg-amber-500/8 border border-amber-500/30 rounded-xl p-4">
                    <div className="flex items-start gap-2 mb-3">
                      <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-amber-300 text-sm font-semibold">
                        Save your private note — it&apos;s the ONLY way to withdraw your funds.
                      </p>
                    </div>
                    <div className="space-y-2 text-xs font-mono">
                      {[
                        { label: "Commitment", value: savedNote.commitment },
                        { label: "Secret", value: savedNote.secret },
                        { label: "Nullifier", value: savedNote.nullifier },
                      ].map(({ label, value }) => (
                        <div
                          key={label}
                          className="flex justify-between items-center bg-black/25 rounded-lg px-3 py-2"
                        >
                          <span className="text-aion-muted">{label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-aion-text">{value.slice(0, 12)}...</span>
                            <button onClick={() => handleCopy(value, label)}>
                              {copied === label ? (
                                <Check size={12} className="text-aion-green" />
                              ) : (
                                <Copy size={12} className="text-aion-muted" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={downloadNote}
                      className="mt-3 w-full btn-purple rounded-lg py-2.5 text-sm flex items-center justify-center gap-2"
                    >
                      <Download size={14} />
                      {noteSaved ? "Downloaded ✓" : "Download Note JSON"}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => {
                    sessionStorage.setItem(
                      "aion_pending_deposit",
                      JSON.stringify({ amount, txHash, mode })
                    );
                    router.push("/ai");
                  }}
                  className="w-full btn-gold rounded-xl py-3 text-sm flex items-center justify-center gap-2"
                >
                  <Sparkles size={15} />
                  View AI Strategy Routing
                </button>

                <button onClick={reset} className="w-full btn-outline rounded-xl py-3 text-sm">
                  New Deposit
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
