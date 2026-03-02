"use client";

import { useState, useRef, useCallback } from "react";
import { useAccount } from "@starknet-react/core";

// ── Types ─────────────────────────────────────────────────────────────────
export type BtcDepositStatus =
  | "idle"          // Not started
  | "quoting"       // Fetching quote
  | "awaiting_btc"  // Address generated, waiting for user to send BTC
  | "confirming"    // BTC tx detected on mempool
  | "wrapping"      // Bitcoin confirmed, bridging to wBTC
  | "depositing"    // wBTC received, depositing into AION vault
  | "done"          // All complete
  | "error";

export interface BtcQuote {
  btcAddress: string;
  amountBtc: string;
  expectedWbtc: string;
  swapFeeWbtc: string;
  networkFeeBtc: string;
  expiresAt: number;
  swapId: string;
}

export interface BtcDepositState {
  status: BtcDepositStatus;
  quote: BtcQuote | null;
  btcTxId: string | null;
  vaultTxHash: string | null;
  error: string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useBtcDeposit() {
  const { address } = useAccount();
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<BtcDepositState>({
    status: "idle",
    quote: null,
    btcTxId: null,
    vaultTxHash: null,
    error: null,
  });

  const setStatus = (status: BtcDepositStatus) =>
    setState((s) => ({ ...s, status }));

  const setError = (error: string) =>
    setState((s) => ({ ...s, status: "error", error }));

  const stopPolling = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  // Simulated quote — realistic BTC deposit address and fee breakdown
  const getQuote = useCallback(
    async (amountBtc: string) => {
      if (!address) {
        setError("Wallet not connected");
        return;
      }

      setState((s) => ({ ...s, status: "quoting", error: null }));

      // Simulate network delay for quote fetching
      await new Promise((r) => setTimeout(r, 1800));

      const amount = parseFloat(amountBtc) || 0;
      const feeRate = 0.003; // 0.3% swap fee
      const swapFee = (amount * feeRate).toFixed(8);
      const expectedWbtc = Math.max(0, amount - parseFloat(swapFee) - 0.00002).toFixed(8);

      const quote: BtcQuote = {
        btcAddress: "tb1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        amountBtc,
        expectedWbtc,
        swapFeeWbtc: swapFee,
        networkFeeBtc: "0.00002",
        expiresAt: Date.now() + 20 * 60 * 1000,
        swapId: `swap_${Date.now()}`,
      };

      setState((s) => ({ ...s, status: "awaiting_btc", quote }));

      // Simulate the bridge flow (demo mode)
      pollRef.current = setTimeout(() => {
        setState((s) => ({
          ...s,
          btcTxId: "7f3a1b9e2c4d8f6a0e5b3c1d9f7a4e2b8c6d0f4a2e8b6c4d2f0a8e6b4c2d0f",
          status: "confirming",
        }));

        pollRef.current = setTimeout(() => {
          setStatus("wrapping");

          pollRef.current = setTimeout(() => {
            const fakeTxHash = "0x04a9f3b2e1c8d7f6a5e4b3c2d1f0e9a8b7c6d5f4e3b2a1c0d9f8e7b6a5c4d3";
            setState((s) => ({
              ...s,
              vaultTxHash: fakeTxHash,
              status: "depositing",
            }));
            // Final step: mark complete after vault deposit finishes
            pollRef.current = setTimeout(() => {
              setState((s) => ({ ...s, status: "done" }));
            }, 4000);
          }, 6000);
        }, 8000);
      }, 5000);
    },
    [address],
  );

  const markVaultDepositDone = useCallback((txHash: string) => {
    stopPolling();
    setState((s) => ({ ...s, status: "done", vaultTxHash: txHash }));
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setState({ status: "idle", quote: null, btcTxId: null, vaultTxHash: null, error: null });
  }, []);

  return { ...state, getQuote, markVaultDepositDone, reset };
}
