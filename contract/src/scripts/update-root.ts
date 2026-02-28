/**
 * Read all commitments from PrivacyLayer, compute the Poseidon Merkle root,
 * and call AionVault.update_merkle_root(new_root) via the deployer.
 *
 * Run after EVERY private deposit:
 *   cd contract && npx tsx src/scripts/update-root.ts
 */

import { deployer, provider } from "./utils";
import { CallData, hash as starkHash } from "starknet";
import * as dotenv from "dotenv";
dotenv.config();

const PRIVACY_LAYER = "0x006ca61df5e017c18a98d5210e486784095537aef49f8e887584a96dd4af3730";
const AION_VAULT    = "0x026678549ab6611b092d99527ead085713f3bd36ebdcbf1755dee4289d0fdcd7";

// ─── Sorted-pair Poseidon hash (matches the Cairo verify_poseidon) ─────────────
// Cairo uses poseidon_hash_span([min, max]) = computePoseidonHashOnElements([...])
function sortedHash(a: string, b: string): string {
  const aNum = BigInt(a);
  const bNum = BigInt(b);
  return aNum < bNum
    ? starkHash.computePoseidonHashOnElements([a, b])
    : starkHash.computePoseidonHashOnElements([b, a]);
}

// ─── Build Merkle root from array of leaves ───────────────────────────────────
function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return "0x0";
  if (leaves.length === 1) return leaves[0];
  let layer = [...leaves];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        next.push(sortedHash(layer[i], layer[i + 1]));
      } else {
        next.push(layer[i]); // odd leaf carries up unchanged
      }
    }
    layer = next;
  }
  return layer[0];
}

// ─── Read all commitments from chain ─────────────────────────────────────────
async function fetchCommitments(): Promise<string[]> {
  // get_total_commitments() -> u32
  const countRes = await provider.callContract({
    contractAddress: PRIVACY_LAYER,
    entrypoint: "get_total_commitments",
    calldata: [],
  });
  const count = Number(BigInt(countRes[0]));
  console.log(`   Total commitments on-chain: ${count}`);

  const commitments: string[] = [];
  for (let i = 0; i < count; i++) {
    const res = await provider.callContract({
      contractAddress: PRIVACY_LAYER,
      entrypoint: "get_commitment_at",
      calldata: CallData.compile({ index: i }),
    });
    commitments.push(res[0]);
    console.log(`   [${i}] ${res[0]}`);
  }
  return commitments;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🌳 Updating PrivacyLayer Merkle root...\n");

  const commitments = await fetchCommitments();

  if (commitments.length === 0) {
    console.log("\n   No commitments found. Nothing to update.\n");
    return;
  }

  const newRoot = computeMerkleRoot(commitments);
  console.log(`\n   Computed root: ${newRoot}`);

  // Check current root
  const currentRootRes = await provider.callContract({
    contractAddress: PRIVACY_LAYER,
    entrypoint: "get_merkle_root",
    calldata: [],
  });
  const currentRoot = currentRootRes[0];
  console.log(`   Current root : ${currentRoot}`);

  if (newRoot === currentRoot) {
    console.log("\n   Root is already up to date. Nothing to do.\n");
    return;
  }

  // Call AionVault.update_merkle_root (owner-only, routes to PrivacyLayer.update_root)
  console.log("\n   Calling AionVault.update_merkle_root...");
  const tx = await deployer.execute([
    {
      contractAddress: AION_VAULT,
      entrypoint: "update_merkle_root",
      calldata: [newRoot],
    },
  ]);
  await provider.waitForTransaction(tx.transaction_hash);

  console.log(`\n✅ Merkle root updated!`);
  console.log(`   New root: ${newRoot}`);
  console.log(`   Tx: ${tx.transaction_hash}\n`);

  if (commitments.length === 1) {
    console.log("   Since there is 1 commitment, the merkle proof for withdrawal is [] (empty).\n");
  }
}

main().catch(console.error);
