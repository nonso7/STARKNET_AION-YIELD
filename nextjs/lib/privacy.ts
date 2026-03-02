// ─── AION Yield — Privacy Helpers (ZK Edition) ────────────────────────────────
//
// Denomination-based commitment scheme.
//
// WHY FIXED DENOMINATIONS?
//   Without them the exact WBTC amount appears in calldata and any observer
//   can fingerprint deposits by amount. With fixed tiers every deposit in a
//   pool is identical in size — only the tier index (0-3) appears in calldata.
//
// COMMITMENT SCHEME:
//   commitment = Poseidon(secret, nullifier, denomination_tier)
//   The tier is baked in so a note cannot be redeemed for a different tier.

import { hash } from "starknet";

// ── Denomination tiers ─────────────────────────────────────────────────────

export const DENOMINATIONS = [
  { tier: 0, wbtc: "0.001", label: "0.001 WBTC", satoshis: 100_000n,     approxUsd: "~$50–100"   },
  { tier: 1, wbtc: "0.01",  label: "0.01 WBTC",  satoshis: 1_000_000n,   approxUsd: "~$500–1K"   },
  { tier: 2, wbtc: "0.1",   label: "0.1 WBTC",   satoshis: 10_000_000n,  approxUsd: "~$5K–10K"   },
  { tier: 3, wbtc: "1.0",   label: "1.0 WBTC",   satoshis: 100_000_000n, approxUsd: "~$50K–100K" },
] as const;

export type DenominationTier = 0 | 1 | 2 | 3;

export function getDenomination(tier: DenominationTier) {
  return DENOMINATIONS[tier];
}

// ── Private note ────────────────────────────────────────────────────────────

export interface PrivateNote {
  secret: string;
  nullifier: string;
  commitment: string;
  nullifierHash: string;
  denominationTier: DenominationTier;
  timestamp: number;
}

// ── Random felt252 ──────────────────────────────────────────────────────────

export function randomFelt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(31));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return "0x" + hex;
}

// ── Hash helpers ────────────────────────────────────────────────────────────

export function computeCommitment(
  secret: string,
  nullifier: string,
  tier: DenominationTier,
): string {
  return hash.computePoseidonHashOnElements([secret, nullifier, tier.toString()]);
}

export function computeNullifierHash(nullifier: string): string {
  return hash.computePoseidonHashOnElements([nullifier]);
}

// ── Note generation ─────────────────────────────────────────────────────────

export function generatePrivateNote(tier: DenominationTier): PrivateNote {
  const secret = randomFelt();
  const nullifier = randomFelt();
  const commitment = computeCommitment(secret, nullifier, tier);
  const nullifierHash = computeNullifierHash(nullifier);
  return { secret, nullifier, commitment, nullifierHash, denominationTier: tier, timestamp: Date.now() };
}

// ── Note storage (localStorage) ─────────────────────────────────────────────

export function serializeNote(note: PrivateNote): string {
  return JSON.stringify(note);
}

export function deserializeNote(raw: string): PrivateNote {
  return JSON.parse(raw) as PrivateNote;
}

export function storeNote(note: PrivateNote): void {
  const key = `aion_note_${note.commitment.slice(2, 10)}`;
  localStorage.setItem(key, serializeNote(note));
  const indexRaw = localStorage.getItem("aion_note_index") ?? "[]";
  const index: string[] = JSON.parse(indexRaw);
  if (!index.includes(key)) {
    index.push(key);
    localStorage.setItem("aion_note_index", JSON.stringify(index));
  }
}

export function loadAllNotes(): PrivateNote[] {
  const indexRaw = localStorage.getItem("aion_note_index") ?? "[]";
  const index: string[] = JSON.parse(indexRaw);
  return index
    .map((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try { return deserializeNote(raw); } catch { return null; }
    })
    .filter(Boolean) as PrivateNote[];
}

export function removeNote(commitment: string): void {
  const key = `aion_note_${commitment.slice(2, 10)}`;
  localStorage.removeItem(key);
  const indexRaw = localStorage.getItem("aion_note_index") ?? "[]";
  const index: string[] = JSON.parse(indexRaw);
  localStorage.setItem("aion_note_index", JSON.stringify(index.filter((k) => k !== key)));
}

// ── Merkle tree (sorted-pair Poseidon) ──────────────────────────────────────

function sortedPairHash(a: string, b: string): string {
  return BigInt(a) < BigInt(b)
    ? hash.computePoseidonHashOnElements([a, b])
    : hash.computePoseidonHashOnElements([b, a]);
}

export function buildMerkleTree(leaves: string[]): string[][] {
  if (leaves.length === 0) return [];
  const layers: string[][] = [leaves];
  let current = [...leaves];
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? sortedPairHash(current[i], current[i + 1]) : current[i]);
    }
    layers.push(next);
    current = next;
  }
  return layers;
}

export function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return "0x0";
  const layers = buildMerkleTree(leaves);
  return layers[layers.length - 1][0];
}

export function buildMerkleProof(commitment: string, allCommitments: string[]): string[] {
  if (allCommitments.length <= 1) return [];
  const layers = buildMerkleTree(allCommitments);
  const proof: string[] = [];
  let idx = allCommitments.indexOf(commitment);
  if (idx === -1) return [];
  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level];
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (siblingIdx < layer.length) proof.push(layer[siblingIdx]);
    idx = Math.floor(idx / 2);
  }
  return proof;
}
