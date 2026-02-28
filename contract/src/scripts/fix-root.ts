/**
 * One-time fix: update the PrivacyLayer Merkle root to the value that Cairo
 * actually derives from (secret, nullifier) using poseidon_hash_span.
 *
 * Root cause: the frontend used hash.computePoseidonHash (2-element hash)
 * but Cairo uses poseidon_hash_span (sponge) — they produce DIFFERENT values.
 *
 * Correct JS equivalent of Cairo's poseidon_hash_span([a, b]) is
 * hash.computePoseidonHashOnElements([a, b]).
 *
 * Run ONCE before withdrawing the existing deposit:
 *   cd contract && npx tsx src/scripts/fix-root.ts
 */

import { deployer, provider } from "./utils";
import { hash as starkHash, CallData } from "starknet";
import * as dotenv from "dotenv";
dotenv.config();

const PRIVACY_LAYER = "0x006ca61df5e017c18a98d5210e486784095537aef49f8e887584a96dd4af3730";
const AION_VAULT    = "0x026678549ab6611b092d99527ead085713f3bd36ebdcbf1755dee4289d0fdcd7";

// ── The existing deposit's secret and nullifier ───────────────────────────────
// These match the saved private note.
const secret   = "0xee85e2b56dd59d7fb71900eb1d60ea670a6721788da2c8fe62f6b17444fd3f";
const nullifier = "0x4f1cd79ba3d9f95bcd5f43b9f981ddb8d6e698d3ebf9331c6614c2bab19d1e";

async function main() {
  console.log("\n🔧 Fixing PrivacyLayer Merkle root...\n");

  // Compute the ROOT Cairo will derive during verify_and_nullify:
  //   poseidon_hash_span([secret, nullifier])  ←  Cairo
  //   computePoseidonHashOnElements([s, n])    ←  JS equivalent
  const correctRoot = starkHash.computePoseidonHashOnElements([secret, nullifier]);
  console.log(`   Correct root (Cairo-compatible): ${correctRoot}`);

  // Compare with old (wrong) value
  const wrongRoot = starkHash.computePoseidonHash(secret, nullifier);
  console.log(`   Wrong root (was stored before) : ${wrongRoot}`);

  // Read current on-chain root
  const currentRootRes = await provider.callContract({
    contractAddress: PRIVACY_LAYER,
    entrypoint: "get_merkle_root",
    calldata: [],
  });
  const currentRoot = currentRootRes[0];
  console.log(`   Current on-chain root          : ${currentRoot}`);

  if (currentRoot === correctRoot) {
    console.log("\n   Root is already correct. Nothing to do.\n");
    return;
  }

  console.log("\n   Calling AionVault.update_merkle_root...");
  const tx = await deployer.execute([{
    contractAddress: AION_VAULT,
    entrypoint: "update_merkle_root",
    calldata: [correctRoot],
  }]);
  await provider.waitForTransaction(tx.transaction_hash);

  console.log(`\n✅ Root fixed!`);
  console.log(`   New root : ${correctRoot}`);
  console.log(`   Tx       : ${tx.transaction_hash}`);
  console.log(`\n👉 Now withdraw the existing deposit from the UI — it should succeed.`);
  console.log(`   After withdrawal, run update-root.ts for any future deposits.\n`);
}

main().catch(console.error);
