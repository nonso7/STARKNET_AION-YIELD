"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "@starknet-react/core";
import { usePublicWithdraw, usePrivateWithdraw, useVaultStats } from "@/hooks/useAionVault";
import {
  Lock, Zap, Shield, Check,
  Eye, EyeOff, Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import {
  loadAllNotes, removeNote, buildMerkleProof, computeCommitment, type PrivateNote,
} from "@/lib/privacy";
import { formatWBTC } from "@/lib/contracts";

type Mode = "public" | "private";
type Step = "input" | "pending" | "success";

export default function WithdrawPage() {
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<Mode>("private");
  const [step, setStep] = useState<Step>("input");
  const [txHash, setTxHash] = useState("");

  // Public withdraw
  const [shareAmount, setShareAmount] = useState("");
  const { withdraw: publicWithdraw, isLoading: pubLoading } = usePublicWithdraw();
  const { sharesFormatted } = useVaultStats();

  // Private withdraw
  const [selectedNote, setSelectedNote] = useState<PrivateNote | null>(null);
  const [recipient, setRecipient] = useState("");
  const [showSecrets, setShowSecrets] = useState(false);
  const [privateNotes, setPrivateNotes] = useState<PrivateNote[]>([]);
  const [manualSecret, setManualSecret] = useState("");
  const [manualNullifier, setManualNullifier] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [useManual, setUseManual] = useState(false);

  const { withdrawPrivate, isLoading: privLoading } = usePrivateWithdraw();
  const isLoading = pubLoading || privLoading;

  useEffect(() => {
    if (typeof window !== "undefined") setPrivateNotes(loadAllNotes());
    if (address) setRecipient(address);
  }, [address]);

  const handlePublicWithdraw = async () => {
    if (!shareAmount || parseFloat(shareAmount) <= 0) {
      toast.error("Enter share amount");
      return;
    }
    setStep("pending");
    try {
      const satoshis = BigInt(Math.round(parseFloat(shareAmount) * 1e8));
      const result = await publicWithdraw(satoshis);
      setTxHash(result.transaction_hash);
      setStep("success");
      toast.success("Withdrawal successful!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      toast.error(msg);
      setStep("input");
    }
  };

  const handlePrivateWithdraw = async () => {
    const secret = useManual ? manualSecret : selectedNote?.secret ?? "";
    const nullifier = useManual ? manualNullifier : selectedNote?.nullifier ?? "";
    const amount = useManual
      ? BigInt(Math.round(parseFloat(manualAmount) * 1e8))
      : selectedNote?.amount ?? 0n;

    if (!secret || !nullifier || amount === 0n) {
      toast.error("Fill in all fields");
      return;
    }
    if (!recipient) {
      toast.error("Enter recipient address");
      return;
    }

    setStep("pending");
    try {
      // Derive commitment — from saved note or recompute from manual inputs
      const commitment = selectedNote
        ? selectedNote.commitment
        : computeCommitment(secret, nullifier);

      const proof = buildMerkleProof(
        commitment,
        privateNotes.map((n) => n.commitment)
      );
      const result = await withdrawPrivate(proof, secret, nullifier, recipient, amount);
      setTxHash(result.transaction_hash);

      if (selectedNote) removeNote(selectedNote.commitment);
      setPrivateNotes((prev) =>
        prev.filter((n) => n.commitment !== selectedNote?.commitment)
      );

      setStep("success");
      toast.success("Private withdrawal successful!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      toast.error(msg);
      setStep("input");
    }
  };

  const reset = () => {
    setStep("input");
    setTxHash("");
    setSelectedNote(null);
    setShareAmount("");
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-aion-dark flex items-center justify-center px-4">
        <div className="glass-card rounded-2xl p-14 text-center max-w-md border border-aion-border privacy-glow">
          <div className="w-16 h-16 bg-aion-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Shield size={28} className="text-aion-accent opacity-70" />
          </div>
          <h2 className="text-xl font-bold text-aion-text mb-2">Connect Your Wallet</h2>
          <p className="text-aion-muted text-sm">Connect to access your positions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-aion-dark pt-28 pb-10 px-4">
      <div className="max-w-xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="badge-purple mb-3 inline-flex">WBTC Withdrawal</div>
          <h1 className="text-4xl font-extrabold text-aion-text">Withdraw</h1>
          <p className="text-aion-muted mt-1 text-sm">Reclaim your WBTC + earned yield.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
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

                {/* ── PUBLIC WITHDRAW ─────────────────────────── */}
                {mode === "public" && (
                  <div className="space-y-4">
                    <div className="bg-aion-gold/8 border border-aion-gold/25 rounded-xl p-3.5 text-sm text-aion-gold flex gap-2">
                      <Zap size={15} className="shrink-0 mt-0.5" />
                      Burns aionWBTC shares and returns WBTC proportional to vault assets.
                    </div>
                    <div>
                      <label className="block text-xs text-aion-muted mb-2 font-medium tracking-wide uppercase">
                        Shares to burn — Balance:{" "}
                        <span className="text-aion-gold font-mono">{sharesFormatted}</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.00000001"
                          placeholder="0.00000000"
                          value={shareAmount}
                          onChange={(e) => setShareAmount(e.target.value)}
                          className="aion-input w-full px-4 py-3.5 pr-16 text-lg"
                        />
                        <button
                          onClick={() => setShareAmount(sharesFormatted)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-aion-accent font-semibold"
                        >
                          MAX
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={handlePublicWithdraw}
                      disabled={!shareAmount || isLoading}
                      className="w-full btn-gold rounded-xl py-3.5 text-sm flex items-center justify-center gap-2"
                    >
                      <Zap size={15} /> Withdraw WBTC
                    </button>
                  </div>
                )}

                {/* ── PRIVATE WITHDRAW ────────────────────────── */}
                {mode === "private" && (
                  <div className="space-y-4">
                    <div className="bg-aion-accent/8 border border-aion-accent/25 rounded-xl p-3.5 text-sm text-aion-accent flex gap-2">
                      <Shield size={15} className="shrink-0 mt-0.5" />
                      Prove ownership with your secret+nullifier. Recipient can be any address.
                    </div>

                    {/* Note selector vs manual */}
                    <div className="tab-group">
                      <button
                        onClick={() => setUseManual(false)}
                        className={clsx("tab-item", !useManual ? "active-purple" : "")}
                      >
                        Select Note
                      </button>
                      <button
                        onClick={() => setUseManual(true)}
                        className={clsx("tab-item", useManual ? "active-purple" : "")}
                      >
                        Enter Manually
                      </button>
                    </div>

                    {!useManual ? (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs text-aion-muted font-medium tracking-wide uppercase">
                            Saved Notes ({privateNotes.length})
                          </label>
                          <button
                            onClick={() => setShowSecrets(!showSecrets)}
                            className="text-xs text-aion-muted flex items-center gap-1 hover:text-aion-text transition-colors"
                          >
                            {showSecrets ? <EyeOff size={12} /> : <Eye size={12} />}
                            {showSecrets ? "Hide" : "Reveal"}
                          </button>
                        </div>
                        {privateNotes.length === 0 ? (
                          <div className="text-center py-6 text-aion-muted text-sm bg-aion-card2 border border-aion-border rounded-xl">
                            No saved notes. Upload a note JSON or enter manually.
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {privateNotes.map((note, i) => (
                              <button
                                key={i}
                                onClick={() => setSelectedNote(note)}
                                className={clsx(
                                  "w-full text-left p-3 rounded-xl border transition-all",
                                  selectedNote?.commitment === note.commitment
                                    ? "border-aion-accent bg-aion-accent/8"
                                    : "border-aion-border hover:border-aion-accent/40"
                                )}
                              >
                                <div className="flex justify-between items-center">
                                  <span className="font-mono text-xs text-aion-muted">
                                    {note.commitment.slice(0, 14)}...
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-aion-green font-mono">
                                      {showSecrets ? formatWBTC(note.amount) + " WBTC" : "••••••"}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeNote(note.commitment);
                                        setPrivateNotes((p) =>
                                          p.filter((n) => n.commitment !== note.commitment)
                                        );
                                      }}
                                      className="text-aion-muted hover:text-aion-red transition-colors"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {[
                          {
                            label: "Secret",
                            value: manualSecret,
                            setter: setManualSecret,
                            placeholder: "0x...",
                          },
                          {
                            label: "Nullifier",
                            value: manualNullifier,
                            setter: setManualNullifier,
                            placeholder: "0x...",
                          },
                          {
                            label: "Amount (WBTC)",
                            value: manualAmount,
                            setter: setManualAmount,
                            placeholder: "0.001",
                          },
                        ].map(({ label, value, setter, placeholder }) => (
                          <div key={label}>
                            <label className="block text-xs text-aion-muted mb-1.5 font-medium tracking-wide uppercase">
                              {label}
                            </label>
                            <input
                              value={value}
                              onChange={(e) => setter(e.target.value)}
                              placeholder={placeholder}
                              className="aion-input w-full px-3 py-2.5 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Recipient */}
                    <div>
                      <label className="block text-xs text-aion-muted mb-1.5 font-medium tracking-wide uppercase">
                        Recipient{" "}
                        <span className="text-aion-accent normal-case">(can differ from depositor)</span>
                      </label>
                      <input
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="0x..."
                        className="aion-input w-full px-3 py-2.5 text-sm"
                      />
                    </div>

                    <button
                      onClick={handlePrivateWithdraw}
                      disabled={(!selectedNote && !useManual) || !recipient || isLoading}
                      className="w-full btn-purple rounded-xl py-3.5 text-sm flex items-center justify-center gap-2"
                    >
                      <Lock size={15} /> Prove &amp; Withdraw Privately
                    </button>
                  </div>
                )}
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
                  Processing Withdrawal...
                </h3>
                <p className="text-aion-muted text-sm">
                  {mode === "private"
                    ? "Verifying proof and releasing funds..."
                    : "Burning shares and returning WBTC..."}
                </p>
              </motion.div>
            )}

            {/* ── Success Step ───────────────────────────────── */}
            {step === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4"
              >
                <div className="w-16 h-16 rounded-2xl bg-aion-green/15 border border-aion-green/30 flex items-center justify-center mx-auto">
                  <Check size={28} className="text-aion-green" />
                </div>
                <h3 className="text-xl font-bold text-aion-text">Withdrawn!</h3>
                <p className="text-aion-muted text-sm">WBTC + yield sent to your address.</p>
                {txHash && (
                  <div className="bg-aion-card2 border border-aion-border rounded-xl p-3 text-xs font-mono text-aion-muted text-left">
                    TX: {txHash.slice(0, 32)}...
                  </div>
                )}
                <button onClick={reset} className="w-full btn-outline rounded-xl py-3 text-sm">
                  New Withdrawal
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
