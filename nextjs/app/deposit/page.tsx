"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "@starknet-react/core";
import { usePrivateDeposit, useVaultStats } from "@/hooks/useAionVault";
import { useBtcDeposit } from "@/hooks/useBtcDeposit";
import { DENOMINATIONS, type DenominationTier, type PrivateNote } from "@/lib/privacy";
import {
  Lock, Copy, Check, AlertTriangle,
  Download, Bitcoin, Shield, Sparkles, ArrowRight,
  RefreshCw, Clock, Info,
} from "lucide-react";
import toast from "react-hot-toast";
import { clsx } from "clsx";

type Mode = "private" | "bitcoin";
type Step = "input" | "pending" | "success";

export default function DepositPage() {
  const { isConnected } = useAccount();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("private");
  const [step, setStep] = useState<Step>("input");
  const [savedNote, setSavedNote] = useState<PrivateNote | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // Private deposit: denomination tier selector (no free-text amount)
  const [selectedTier, setSelectedTier] = useState<DenominationTier | null>(null);

  const { tvlFormatted, apyFormatted, wbtcBalanceFormatted } = useVaultStats();
  const { depositPrivate, isLoading } = usePrivateDeposit();

  const [btcAmount, setBtcAmount] = useState("");
  const btc = useBtcDeposit();

  const handleCopy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  // ── Deposit handler ──────────────────────────────────────────────────────
  const handleDeposit = async () => {
    if (mode === "private") {
      if (selectedTier === null) { toast.error("Select a denomination"); return; }
      setStep("pending");
      try {
        const { result, note } = await depositPrivate(selectedTier);
        setTxHash(result.transaction_hash);
        setSavedNote(note);
        setStep("success");
        toast.success("Private deposit successful!");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Transaction failed");
        setStep("input");
      }
    }
  };

  const handleBtcQuote = async () => {
    if (!btcAmount || parseFloat(btcAmount) <= 0) { toast.error("Enter a valid BTC amount"); return; }
    await btc.getQuote(btcAmount);
  };

  const downloadNote = () => {
    if (!savedNote) return;
    const content = JSON.stringify(savedNote, null, 2);
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
    setSelectedTier(null);
    setSavedNote(null);
    setNoteSaved(false);
    setTxHash("");
  };

  const resetBtc = () => { setBtcAmount(""); btc.reset(); };

  const btcStatusLabel: Record<string, string> = {
    idle: "", quoting: "Getting quote...", awaiting_btc: "Send BTC to the address below",
    confirming: "BTC detected — waiting for confirmations...",
    wrapping: "Confirmed! Converting BTC → wBTC on Starknet...",
    depositing: "wBTC received — depositing to AION vault...",
    done: "Complete!", error: "Error",
  };

  const btcStatusColor: Record<string, string> = {
    quoting: "text-aion-muted", awaiting_btc: "text-aion-gold",
    confirming: "text-amber-400", wrapping: "text-aion-accent",
    depositing: "text-aion-accent", done: "text-aion-green", error: "text-red-400",
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
          <div className="badge-gold mb-3 inline-flex">
            {mode === "bitcoin" ? "Native Bitcoin Deposit" : "WBTC Deposit"}
          </div>
          <h1 className="text-4xl font-extrabold text-aion-text">Deposit</h1>
          <p className="text-aion-muted mt-1 text-sm">Deposit and start earning yield privately.</p>
        </motion.div>

        {/* Vault info strip */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="glass-card rounded-xl px-5 py-3.5 border border-aion-border mb-6 flex items-center justify-between">
          <div className="text-xs text-aion-muted">
            TVL <span className="text-aion-gold font-mono font-semibold ml-1">{tvlFormatted} WBTC</span>
          </div>
          <div className="w-px h-4 bg-aion-border" />
          <div className="text-xs text-aion-muted">
            APY <span className="text-aion-green font-mono font-semibold ml-1">{apyFormatted}</span>
          </div>
          <div className="w-px h-4 bg-aion-border" />
          <div className="text-xs text-aion-muted">
            Balance <span className="text-aion-text font-mono font-semibold ml-1">{wbtcBalanceFormatted}</span>
          </div>
        </motion.div>

        {/* Main card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-card rounded-2xl p-6 border border-aion-border">
          <AnimatePresence mode="wait">

            {/* ══ INPUT STEP ══════════════════════════════════════════════════ */}
            {step === "input" && btc.status === "idle" && (
              <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                {/* Mode tabs */}
                <div className="tab-group mb-6">
                  {(["private", "bitcoin"] as Mode[]).map((m) => (
                    <button key={m} onClick={() => { setMode(m); resetBtc(); reset(); }}
                      className={clsx(
                        "tab-item flex items-center justify-center gap-2",
                        mode === m ? (m === "private" ? "active-purple" : "active-gold") : "",
                      )}>
                      {m === "private" && <Lock size={13} />}
                      {m === "bitcoin" && <Bitcoin size={13} />}
                      {m === "private" ? "Private" : "Bitcoin"}
                    </button>
                  ))}
                </div>

                {/* Mode description */}
                {mode === "bitcoin" ? (
                  <div className="rounded-xl p-4 mb-5 text-sm bg-aion-gold/8 border border-aion-gold/25 text-aion-gold">
                    <div className="flex gap-2">
                      <Bitcoin size={15} className="shrink-0 mt-0.5" />
                      <span>Send native Bitcoin — Atomiq&apos;s trustless bridge wraps it to wBTC on Starknet automatically.</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl p-4 mb-5 text-sm bg-aion-accent/8 border border-aion-accent/25 text-aion-accent">
                    <div className="flex gap-2">
                      <Shield size={15} className="shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p>Your deposit amount is hidden on-chain. A Noir ZK proof proves ownership without revealing secret or amount.</p>
                        <p className="text-aion-accent/70 text-xs">Fixed denominations prevent amount-based fingerprinting. All deposits in a pool are identical in size.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── BITCOIN input ── */}
                {mode === "bitcoin" && (
                  <>
                    <label className="block text-xs text-aion-muted mb-2 font-medium tracking-wide uppercase">Amount (BTC)</label>
                    <div className="relative mb-3">
                      <input type="number" min="0" step="0.0001" placeholder="0.00000000"
                        value={btcAmount} onChange={(e) => setBtcAmount(e.target.value)}
                        className="aion-input w-full px-4 py-3.5 pr-16 text-lg" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-aion-muted text-xs font-mono">BTC</span>
                    </div>
                    {btcAmount && parseFloat(btcAmount) > 0 && (
                      <div className="flex items-center gap-2 mb-5 px-1 text-xs text-aion-muted">
                        <span className="font-mono">{parseFloat(btcAmount).toFixed(8)} BTC</span>
                        <ArrowRight size={12} className="text-aion-gold" />
                        <span className="font-mono text-aion-text">~{(parseFloat(btcAmount) * 0.998).toFixed(8)} wBTC</span>
                        <span>(~0.2% fee)</span>
                      </div>
                    )}
                    <button onClick={handleBtcQuote} disabled={!btcAmount || parseFloat(btcAmount) <= 0}
                      className="w-full btn-gold py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                      <Bitcoin size={15} /> Get Bitcoin Deposit Address
                    </button>
                  </>
                )}

                {/* ── PRIVATE input — denomination picker ── */}
                {mode === "private" && (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs text-aion-muted font-medium tracking-wide uppercase">Select Denomination</label>
                      <div className="flex items-center gap-1 text-xs text-aion-muted">
                        <Info size={11} />
                        <span>Fixed amounts = stronger privacy</span>
                      </div>
                    </div>

                    {/* Denomination grid */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {DENOMINATIONS.map((d) => (
                        <button key={d.tier} onClick={() => setSelectedTier(d.tier as DenominationTier)}
                          className={clsx(
                            "rounded-xl border p-4 text-left transition-all duration-150",
                            selectedTier === d.tier
                              ? "border-aion-accent bg-aion-accent/10 shadow-[0_0_12px_rgba(139,92,246,0.25)]"
                              : "border-aion-border bg-aion-card2 hover:border-aion-accent/40",
                          )}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={clsx(
                              "font-mono font-bold text-base",
                              selectedTier === d.tier ? "text-aion-accent" : "text-aion-text",
                            )}>{d.label}</span>
                            {selectedTier === d.tier && (
                              <div className="w-4 h-4 rounded-full bg-aion-accent flex items-center justify-center">
                                <Check size={10} className="text-white" />
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-aion-muted">{d.approxUsd}</div>
                        </button>
                      ))}
                    </div>

                    {/* ZK explanation */}
                    <div className="bg-aion-card2 border border-aion-border rounded-xl px-4 py-3 mb-5 space-y-2">
                      <div className="flex items-start gap-2 text-xs text-aion-muted">
                        <Shield size={12} className="text-aion-accent shrink-0 mt-0.5" />
                        <span><span className="text-aion-text font-medium">What Voyager shows:</span> commitment hash + tier index — no amount, no identity</span>
                      </div>
                      <div className="flex items-start gap-2 text-xs text-aion-muted">
                        <Lock size={12} className="text-aion-accent shrink-0 mt-0.5" />
                        <span><span className="text-aion-text font-medium">Noir ZK proof</span> verifies ownership at withdrawal — secret never touches the chain</span>
                      </div>
                    </div>

                    <button onClick={handleDeposit}
                      disabled={selectedTier === null || isLoading}
                      className="w-full btn-purple py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                      <Lock size={15} />
                      {selectedTier !== null
                        ? `Deposit ${DENOMINATIONS[selectedTier].label} Privately`
                        : "Select a Denomination"}
                    </button>
                  </>
                )}
              </motion.div>
            )}

            {/* ══ BITCOIN FLOW ════════════════════════════════════════════════ */}
            {mode === "bitcoin" && btc.status !== "idle" && btc.status !== "done" && (
              <motion.div key="btc-flow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                {/* Progress steps */}
                <div className="flex items-center gap-0 mb-2">
                  {(["quoting", "awaiting_btc", "confirming", "wrapping", "depositing"] as const).map((s, i) => {
                    const statuses = ["quoting", "awaiting_btc", "confirming", "wrapping", "depositing"];
                    const currentIdx = statuses.indexOf(btc.status);
                    const isDone = i < currentIdx;
                    const isActive = i === currentIdx;
                    return (
                      <div key={s} className="flex items-center flex-1">
                        <div className={clsx(
                          "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                          isDone ? "bg-aion-green text-black" :
                          isActive ? "bg-aion-gold text-black animate-pulse" :
                          "bg-aion-card border border-aion-border text-aion-muted",
                        )}>
                          {isDone ? "✓" : i + 1}
                        </div>
                        {i < 4 && <div className={clsx("h-px flex-1", isDone ? "bg-aion-green/40" : "bg-aion-border")} />}
                      </div>
                    );
                  })}
                </div>

                <div className={clsx("text-sm font-medium text-center", btcStatusColor[btc.status] ?? "text-aion-muted")}>
                  {btc.status === "quoting"
                    ? <div className="flex items-center justify-center gap-2"><RefreshCw size={14} className="animate-spin" />{btcStatusLabel.quoting}</div>
                    : btcStatusLabel[btc.status]}
                </div>

                {btc.quote && (btc.status === "awaiting_btc" || btc.status === "confirming") && (
                  <div className="bg-aion-card2 border border-aion-gold/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-aion-muted uppercase tracking-wide font-medium">Send exactly</span>
                      <span className="text-aion-gold font-mono font-bold text-sm">{btc.quote.amountBtc} BTC</span>
                    </div>
                    <div className="bg-black/30 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-aion-muted">Bitcoin Address</span>
                        <button onClick={() => handleCopy(btc.quote!.btcAddress, "btcAddr")}
                          className="flex items-center gap-1 text-xs text-aion-accent hover:text-aion-accent/80">
                          {copied === "btcAddr" ? <Check size={12} className="text-aion-green" /> : <Copy size={12} />}
                          {copied === "btcAddr" ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="text-aion-text font-mono text-xs break-all leading-relaxed">{btc.quote.btcAddress}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-black/20 rounded-lg p-2">
                        <div className="text-aion-muted mb-1">You receive</div>
                        <div className="text-aion-green font-mono font-semibold">~{btc.quote.expectedWbtc} wBTC</div>
                      </div>
                      <div className="bg-black/20 rounded-lg p-2">
                        <div className="text-aion-muted mb-1">Quote expires</div>
                        <div className="text-aion-text font-mono flex items-center gap-1">
                          <Clock size={11} />
                          {Math.max(0, Math.floor((btc.quote.expiresAt - Date.now()) / 60000))} min
                        </div>
                      </div>
                    </div>
                    <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2 flex items-start gap-2">
                      <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-amber-300 text-xs">Send the <strong>exact amount</strong> above. Use a self-custody wallet, not an exchange.</p>
                    </div>
                  </div>
                )}

                {(btc.status === "wrapping" || btc.status === "depositing") && (
                  <div className="text-center py-6">
                    <div className="w-14 h-14 rounded-full border-4 border-aion-accent border-t-transparent animate-spin mx-auto mb-4" />
                    <p className="text-aion-muted text-sm">
                      {btc.status === "wrapping" ? "Wrapping BTC → wBTC on Starknet..." : "Depositing wBTC into AION vault..."}
                    </p>
                    {btc.btcTxId && (
                      <p className="text-xs text-aion-muted mt-2 font-mono">BTC tx: {btc.btcTxId.slice(0, 20)}...</p>
                    )}
                  </div>
                )}

                {btc.status === "error" && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">{btc.error}</div>
                )}

                <button onClick={resetBtc} className="w-full btn-outline rounded-xl py-2.5 text-sm">← Cancel</button>
              </motion.div>
            )}

            {/* ══ BITCOIN SUCCESS ═════════════════════════════════════════════ */}
            {mode === "bitcoin" && btc.status === "done" && (
              <motion.div key="btc-done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-aion-green/15 border border-aion-green/30 flex items-center justify-center mx-auto mb-4">
                    <Check size={28} className="text-aion-green" />
                  </div>
                  <h3 className="text-xl font-bold text-aion-text">Bitcoin Deposited!</h3>
                  <p className="text-aion-muted text-sm mt-1">
                    {btc.quote?.amountBtc} BTC → {btc.quote?.expectedWbtc} wBTC in vault
                  </p>
                </div>
                {btc.vaultTxHash && (
                  <div className="bg-aion-card2 border border-aion-border rounded-xl p-3 flex items-center justify-between">
                    <span className="text-xs text-aion-muted font-mono">{btc.vaultTxHash.slice(0, 22)}...</span>
                    <button onClick={() => handleCopy(btc.vaultTxHash!, "vaultTx")}>
                      {copied === "vaultTx" ? <Check size={14} className="text-aion-green" /> : <Copy size={14} className="text-aion-muted" />}
                    </button>
                  </div>
                )}
                <button onClick={() => { sessionStorage.setItem("aion_pending_deposit", JSON.stringify({ amount: btc.quote?.expectedWbtc ?? btcAmount, txHash: btc.vaultTxHash ?? "", mode: "bitcoin" })); router.push("/ai"); }}
                  className="w-full btn-gold rounded-xl py-3 text-sm flex items-center justify-center gap-2">
                  <Sparkles size={15} /> View AI Strategy Routing
                </button>
                <button onClick={resetBtc} className="w-full btn-outline rounded-xl py-3 text-sm">New Deposit</button>
              </motion.div>
            )}

            {/* ══ PENDING ═════════════════════════════════════════════════════ */}
            {step === "pending" && (
              <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-10">
                <div className="w-16 h-16 rounded-full border-4 border-aion-accent border-t-transparent animate-spin mx-auto mb-5" />
                <h3 className="text-lg font-semibold text-aion-text mb-2">Creating Private Position...</h3>
                <p className="text-aion-muted text-sm">Generating ZK commitment and submitting transaction...</p>
              </motion.div>
            )}

            {/* ══ SUCCESS ═════════════════════════════════════════════════════ */}
            {step === "success" && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-aion-green/15 border border-aion-green/30 flex items-center justify-center mx-auto mb-4">
                    <Check size={28} className="text-aion-green" />
                  </div>
                  <h3 className="text-xl font-bold text-aion-text">
                    {mode === "private" ? "Privately Deposited!" : "Deposited!"}
                  </h3>
                  <p className="text-aion-muted text-sm mt-1">
                    {selectedTier !== null
                      ? `${DENOMINATIONS[selectedTier].label} is now earning yield privately`
                      : "Deposit is now earning yield privately"}
                  </p>
                </div>

                {txHash && (
                  <div className="bg-aion-card2 border border-aion-border rounded-xl p-3 flex items-center justify-between">
                    <span className="text-xs text-aion-muted font-mono">{txHash.slice(0, 22)}...</span>
                    <button onClick={() => handleCopy(txHash, "tx")} className="text-aion-accent hover:text-aion-accent/80 transition-colors">
                      {copied === "tx" ? <Check size={14} className="text-aion-green" /> : <Copy size={14} />}
                    </button>
                  </div>
                )}

                {/* Private note download */}
                {mode === "private" && savedNote && (
                  <div className="bg-amber-500/8 border border-amber-500/30 rounded-xl p-4">
                    <div className="flex items-start gap-2 mb-3">
                      <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-amber-300 text-sm font-semibold">
                        Save your private note — it&apos;s the ONLY way to withdraw your funds.
                      </p>
                    </div>
                    <div className="space-y-2 text-xs font-mono mb-3">
                      {[
                        { label: "Commitment", value: savedNote.commitment },
                        { label: "Nullifier Hash", value: savedNote.nullifierHash },
                        { label: "Denomination", value: `Tier ${savedNote.denominationTier} — ${DENOMINATIONS[savedNote.denominationTier].label}` },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center bg-black/25 rounded-lg px-3 py-2">
                          <span className="text-aion-muted">{label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-aion-text">{value.length > 20 ? value.slice(0, 14) + "..." : value}</span>
                            {value.startsWith("0x") && (
                              <button onClick={() => handleCopy(value, label)}>
                                {copied === label ? <Check size={12} className="text-aion-green" /> : <Copy size={12} className="text-aion-muted" />}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-aion-accent/8 border border-aion-accent/20 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
                      <Shield size={12} className="text-aion-accent shrink-0 mt-0.5" />
                      <p className="text-aion-accent text-xs">
                        The note file contains your secret and nullifier. These are never stored on-chain.
                        Generate a Noir ZK proof with this note to withdraw to any fresh address.
                      </p>
                    </div>
                    <button onClick={downloadNote}
                      className="w-full btn-purple rounded-lg py-2.5 text-sm flex items-center justify-center gap-2">
                      <Download size={14} />
                      {noteSaved ? "Downloaded ✓" : "Download Note JSON"}
                    </button>
                  </div>
                )}

                <button onClick={() => { sessionStorage.setItem("aion_pending_deposit", JSON.stringify({ amount: selectedTier !== null ? DENOMINATIONS[selectedTier].wbtc : "", txHash, mode })); router.push("/ai"); }}
                  className="w-full btn-gold rounded-xl py-3 text-sm flex items-center justify-center gap-2">
                  <Sparkles size={15} /> View AI Strategy Routing
                </button>

                <button onClick={reset} className="w-full btn-outline rounded-xl py-3 text-sm">New Deposit</button>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
