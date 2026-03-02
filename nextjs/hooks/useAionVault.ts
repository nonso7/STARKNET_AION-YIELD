"use client";

import { useCallback, useState } from "react";
import { useAccount, useReadContract } from "@starknet-react/core";
import { CONTRACTS, AION_VAULT_ABI, ERC20_ABI, formatWBTC } from "@/lib/contracts";
import {
  generatePrivateNote, storeNote, getDenomination,
  type PrivateNote, type DenominationTier,
} from "@/lib/privacy";

// ─── Public Deposit ────────────────────────────────────────────────────────────

export function usePublicDeposit() {
  const { account } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(
    async (btcAmount: string) => {
      if (!account) throw new Error("Wallet not connected");
      setIsLoading(true);
      setError(null);
      try {
        // Convert WBTC decimal string to satoshis (8 decimals)
        const amount = BigInt(Math.round(parseFloat(btcAmount) * 1e8));
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
    [account],
  );

  return { deposit, isLoading, error };
}

// ─── Private Deposit (ZK Edition) ──────────────────────────────────────────────
//
// Calldata sent on-chain:
//   commitment      = Poseidon(secret, nullifier, tier)  — opaque hash
//   denomination_tier = 0 | 1 | 2 | 3
//
// The WBTC amount is derived from the tier INSIDE the contract.
// secret and nullifier never appear in calldata.

export function usePrivateDeposit() {
  const { account } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedNote, setGeneratedNote] = useState<PrivateNote | null>(null);

  const depositPrivate = useCallback(
    async (tier: DenominationTier) => {
      if (!account) throw new Error("Wallet not connected");
      setIsLoading(true);
      setError(null);

      try {
        const denom = getDenomination(tier);
        const amount = denom.satoshis;

        // Generate note off-chain — commitment includes the tier
        const note = generatePrivateNote(tier);
        setGeneratedNote(note);
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
            // New interface: deposit_private(commitment: felt252, denomination_tier: u8)
            // tier is 0/1/2/3 — fits in u8, amount is never in calldata
            calldata: [note.commitment, tier.toString()],
          },
        ];

        const result = await account.execute(calls);

        // Trigger off-chain Merkle root update (non-blocking)
        fetch("/api/update-root", { method: "POST" }).catch(() => {});

        return { result, note };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Transaction failed";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [account],
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
    [account],
  );

  return { withdraw, isLoading, error };
}

// ─── Private Withdraw (ZK Edition) ─────────────────────────────────────────────
//
// Calldata sent on-chain:
//   zk_proof         = Garaga-formatted proof bytes (opaque)
//   nullifier_hash   = Poseidon(nullifier) — marks note as spent
//   recipient        = withdrawal destination
//   denomination_tier = 0 | 1 | 2 | 3
//
// secret and nullifier are NEVER in calldata — they exist only in the
// ZK proof's private witness, computed off-chain by Barretenberg.

export function usePrivateWithdraw() {
  const { account } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdrawPrivate = useCallback(
    async (
      zkProof: string[],         // Garaga-formatted proof (felt252 array)
      nullifierHash: string,     // Poseidon(nullifier)
      recipient: string,         // Starknet address
      tier: DenominationTier,
    ) => {
      if (!account) throw new Error("Wallet not connected");
      setIsLoading(true);
      setError(null);

      try {
        // Encode Span<felt252> for zk_proof
        const proofCalldata = [zkProof.length.toString(), ...zkProof];

        const result = await account.execute([
          {
            contractAddress: CONTRACTS.AION_VAULT,
            entrypoint: "withdraw_private",
            calldata: [
              ...proofCalldata,
              nullifierHash,
              recipient,
              tier.toString(),
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
    [account],
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

  const tvl = tvlRaw ? BigInt(tvlRaw.toString()) : 0n;
  const apyBps = apyRaw ? Number(apyRaw) : 0;
  const shares = sharesRaw ? BigInt(sharesRaw.toString()) : 0n;
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
