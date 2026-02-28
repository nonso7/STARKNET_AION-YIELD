// ─── AION Yield — Privacy Helpers ─────────────────────────────────────────────
// Client-side utilities for generating commitment schemes.
// secret + nullifier are NEVER sent on-chain — only their Poseidon hash.

import { hash } from "starknet";

export interface PrivateNote {
  secret: string;       // hex felt252
  nullifier: string;    // hex felt252
  commitment: string;   // poseidon(secret, nullifier)
  amount: bigint;       // in satoshis
  timestamp: number;
}

/**
 * Generate a random felt252 as a hex string.
 */
export function randomFelt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(31));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return "0x" + hex;
}

/**
 * Compute commitment = poseidon_hash_span([secret, nullifier]).
 * Must use computePoseidonHashOnElements (sponge construction) to match
 * Cairo's poseidon_hash_span — NOT computePoseidonHash which is different.
 */
export function computeCommitment(secret: string, nullifier: string): string {
  return hash.computePoseidonHashOnElements([secret, nullifier]);
}

/**
 * Compute nullifier hash = poseidon(nullifier).
 * This is what gets stored on-chain as spent.
 */
export function computeNullifierHash(nullifier: string): string {
  return hash.computePoseidonHashOnElements([nullifier]);
}

/**
 * Generate a fresh private note for a deposit.
 * Store the returned note securely — losing it means losing access to funds.
 */
export function generatePrivateNote(amount: bigint): PrivateNote {
  const secret = randomFelt();
  const nullifier = randomFelt();
  const commitment = computeCommitment(secret, nullifier);

  return {
    secret,
    nullifier,
    commitment,
    amount,
    timestamp: Date.now(),
  };
}

/**
 * Serialize a private note for local storage (encrypted in real app).
 */
export function serializeNote(note: PrivateNote): string {
  return JSON.stringify({
    ...note,
    amount: note.amount.toString(),
  });
}

/**
 * Deserialize a private note from storage.
 */
export function deserializeNote(raw: string): PrivateNote {
  const parsed = JSON.parse(raw);
  return {
    ...parsed,
    amount: BigInt(parsed.amount),
  };
}

/**
 * Store a private note in localStorage under a key derived from commitment.
 * In production: encrypt with user's wallet key.
 */
export function storeNote(note: PrivateNote): void {
  const key = `aion_note_${note.commitment.slice(2, 10)}`;
  localStorage.setItem(key, serializeNote(note));
  // Also keep an index
  const indexRaw = localStorage.getItem("aion_note_index") ?? "[]";
  const index: string[] = JSON.parse(indexRaw);
  if (!index.includes(key)) {
    index.push(key);
    localStorage.setItem("aion_note_index", JSON.stringify(index));
  }
}

/**
 * Load all stored private notes from localStorage.
 */
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

/**
 * Remove a note (after successful withdrawal).
 */
export function removeNote(commitment: string): void {
  const key = `aion_note_${commitment.slice(2, 10)}`;
  localStorage.removeItem(key);
  const indexRaw = localStorage.getItem("aion_note_index") ?? "[]";
  const index: string[] = JSON.parse(indexRaw);
  localStorage.setItem(
    "aion_note_index",
    JSON.stringify(index.filter((k) => k !== key))
  );
}

// ─── Merkle Tree (Poseidon sorted-pair, matches PrivacyLayer.verify_poseidon) ──

function sortedPairHash(a: string, b: string): string {
  const aNum = BigInt(a);
  const bNum = BigInt(b);
  // Must match Cairo's poseidon_hash_span([min, max]) — use OnElements, not Hash
  return aNum < bNum
    ? hash.computePoseidonHashOnElements([a, b])
    : hash.computePoseidonHashOnElements([b, a]);
}

/**
 * Build a Poseidon Merkle tree from an array of leaves.
 * Returns each layer from leaves (index 0) up to root (last index).
 * Odd leaves carry up to the next layer unchanged.
 */
export function buildMerkleTree(leaves: string[]): string[][] {
  if (leaves.length === 0) return [];
  const layers: string[][] = [leaves];
  let current = [...leaves];
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(sortedPairHash(current[i], current[i + 1]));
      } else {
        next.push(current[i]); // odd leaf carries up
      }
    }
    layers.push(next);
    current = next;
  }
  return layers;
}

/**
 * Compute Merkle root from leaf array.
 */
export function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return "0x0";
  const layers = buildMerkleTree(leaves);
  return layers[layers.length - 1][0];
}

/**
 * Build a Merkle proof (list of siblings) for a given commitment.
 * For a single commitment the proof is [] — root equals the leaf.
 */
export function buildMerkleProof(commitment: string, allCommitments: string[]): string[] {
  if (allCommitments.length <= 1) return [];
  const layers = buildMerkleTree(allCommitments);
  const proof: string[] = [];
  let idx = allCommitments.indexOf(commitment);
  if (idx === -1) return [];

  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level];
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (siblingIdx < layer.length) {
      proof.push(layer[siblingIdx]);
    }
    // If no sibling (odd leaf), it carries up — nothing to add to proof
    idx = Math.floor(idx / 2);
  }
  return proof;
}
