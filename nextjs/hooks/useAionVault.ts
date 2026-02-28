"use client";

import { useCallback, useState } from "react";
import { useAccount, useContract, useSendTransaction, useReadContract } from "@starknet-react/core";
import { CONTRACTS, AION_VAULT_ABI, ERC20_ABI, parseWBTC, formatWBTC } from "@/lib/contracts";
import { generatePrivateNote, computeCommitment, storeNote, type PrivateNote } from "@/lib/privacy";

// ─── Public Deposit ────────────────────────────────────────────────────────────

export function usePublicDeposit() {
  const { account } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { sendAsync } = useSendTransaction({ calls: [] });

  const deposit = useCallback(
    async (btcAmount: string) => {
      if (!account) throw new Error("Wallet not connected");
      setIsLoading(true);
      setError(null);

      try {
        const amount = parseWBTC(btcAmount);

        // 1. Approve WBTC
        // 2. Deposit into vault
        const calls = [
          {
            contractAddress: CONTRACTS.WBTC_TOKEN,
            entrypoint: "approve",
            calldata: [CONTRACTS.AION_VAULT, amount.toString(), "0"],
          },
          {
            contractAddress: CONTRACTS.AION_VAULT,
            entrypoint: "deposit",
            calldata: [amount.toString(), "0"],
          },
        ];

        const result = await account.execute(calls);
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Transaction failed";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [account]
  );

  return { deposit, isLoading, error };
}

// ─── Private Deposit ───────────────────────────────────────────────────────────

export function usePrivateDeposit() {
  const { account } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedNote, setGeneratedNote] = useState<PrivateNote | null>(null);

  const depositPrivate = useCallback(
    async (btcAmount: string) => {
      if (!account) throw new Error("Wallet not connected");
      setIsLoading(true);
      setError(null);

      try {
        const amount = parseWBTC(btcAmount);

        // Generate private note off-chain
        const note = generatePrivateNote(amount);
        setGeneratedNote(note);

        // Store note locally BEFORE sending tx (so it's safe if tx fails)
        storeNote(note);

        const calls = [
          {
            contractAddress: CONTRACTS.WBTC_TOKEN,
            entrypoint: "approve",
            calldata: [CONTRACTS.AION_VAULT, amount.toString(), "0"],
          },
          {
            contractAddress: CONTRACTS.AION_VAULT,
            entrypoint: "deposit_private",
            calldata: [note.commitment, amount.toString(), "0"],
          },
        ];

        const result = await account.execute(calls);

        // Auto-update Merkle root after deposit confirms (server-side, uses deployer key)
        fetch("/api/update-root", { method: "POST" }).catch(() => {
          // Non-blocking — root update failure doesn't affect the deposit
        });

        return { result, note };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Transaction failed";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [account]
  );

  return { depositPrivate, isLoading, error, generatedNote };
}

// ─── Public Withdraw ───────────────────────────────────────────────────────────

export function usePublicWithdraw() {
  const { account } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(
    async (shares: bigint) => {
      if (!account) throw new Error("Wallet not connected");
      setIsLoading(true);
      setError(null);

      try {
        const result = await account.execute([
          {
            contractAddress: CONTRACTS.AION_VAULT,
            entrypoint: "withdraw",
            calldata: [shares.toString(), "0"],
          },
        ]);
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Transaction failed";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [account]
  );

  return { withdraw, isLoading, error };
}

// ─── Private Withdraw ──────────────────────────────────────────────────────────

export function usePrivateWithdraw() {
  const { account } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdrawPrivate = useCallback(
    async (
      merkleProof: string[],
      secret: string,
      nullifier: string,
      recipient: string,
      amount: bigint
    ) => {
      if (!account) throw new Error("Wallet not connected");
      setIsLoading(true);
      setError(null);

      try {
        // Encode Span<felt252> for merkle_proof
        const proofCalldata = [merkleProof.length.toString(), ...merkleProof];

        const result = await account.execute([
          {
            contractAddress: CONTRACTS.AION_VAULT,
            entrypoint: "withdraw_private",
            calldata: [
              ...proofCalldata,
              secret,
              nullifier,
              recipient,
              amount.toString(),
              "0",
            ],
          },
        ]);
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Transaction failed";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [account]
  );

  return { withdrawPrivate, isLoading, error };
}

// ─── Vault Stats ───────────────────────────────────────────────────────────────

export function useVaultStats() {
  const { address } = useAccount();

  const { data: tvlRaw } = useReadContract({
    abi: AION_VAULT_ABI,
    address: CONTRACTS.AION_VAULT as `0x${string}`,
    functionName: "get_tvl",
    args: [],
    watch: true,
    refetchInterval: 10000,
  });

  const { data: apyRaw } = useReadContract({
    abi: AION_VAULT_ABI,
    address: CONTRACTS.AION_VAULT as `0x${string}`,
    functionName: "get_apy_bps",
    args: [],
    watch: true,
    refetchInterval: 30000,
  });

  const { data: sharesRaw } = useReadContract({
    abi: AION_VAULT_ABI,
    address: CONTRACTS.AION_VAULT as `0x${string}`,
    functionName: "get_share_balance",
    args: address ? [address] : undefined,
    enabled: !!address,
    watch: true,
    refetchInterval: 10000,
  });

  const { data: wbtcBalanceRaw } = useReadContract({
    abi: ERC20_ABI,
    address: CONTRACTS.WBTC_TOKEN as `0x${string}`,
    functionName: "balance_of",
    args: address ? [address] : undefined,
    enabled: !!address,
    watch: true,
    refetchInterval: 10000,
  });

  const tvl = tvlRaw ? BigInt(tvlRaw.toString()) : 0;
  const apyBps = apyRaw ? Number(apyRaw) : 0;
  const shares = sharesRaw ? BigInt(sharesRaw.toString()) : 0;
  const wbtcBalance = wbtcBalanceRaw ? BigInt(wbtcBalanceRaw.toString()) : 0n;

  return {
    tvl,
    tvlFormatted: formatWBTC(tvl),
    apyBps,
    apyFormatted: (apyBps / 100).toFixed(2) + "%",
    shares,
    sharesFormatted: formatWBTC(shares),
    wbtcBalance,
    wbtcBalanceFormatted: formatWBTC(wbtcBalance),
  };
}
