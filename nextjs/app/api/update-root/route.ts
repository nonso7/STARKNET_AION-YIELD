/**
 * POST /api/update-root
 * Called automatically by the frontend after every private deposit.
 * Reads all commitments from PrivacyLayer, computes the Poseidon Merkle root,
 * and calls AionVault.update_merkle_root() using the deployer account.
 */

import { NextResponse } from "next/server";
import { RpcProvider, Account, hash as starkHash, CallData } from "starknet";

const PRIVACY_LAYER = "0x006ca61df5e017c18a98d5210e486784095537aef49f8e887584a96dd4af3730";
const AION_VAULT    = "0x026678549ab6611b092d99527ead085713f3bd36ebdcbf1755dee4289d0fdcd7";

// Must match Cairo's poseidon_hash_span([min, max]) — use OnElements, not Hash
function sortedHash(a: string, b: string): string {
  return BigInt(a) < BigInt(b)
    ? starkHash.computePoseidonHashOnElements([a, b])
    : starkHash.computePoseidonHashOnElements([b, a]);
}

function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return "0x0";
  if (leaves.length === 1) return leaves[0];
  let layer = [...leaves];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(i + 1 < layer.length
        ? sortedHash(layer[i], layer[i + 1])
        : layer[i]
      );
    }
    layer = next;
  }
  return layer[0];
}

export async function POST() {
  try {
    const nodeUrl = process.env.STARKNET_RPC_URL!;
    const provider = new RpcProvider({ nodeUrl });
    const deployer = new Account(
      { provider: { nodeUrl }, address: process.env.DEPLOYER_ADDRESS!, signer: process.env.DEPLOYER_PRIVATE_KEY! }
    );

    // Read total commitments
    const countRes = await provider.callContract({
      contractAddress: PRIVACY_LAYER,
      entrypoint: "get_total_commitments",
      calldata: [],
    });
    const count = Number(BigInt(countRes[0]));

    if (count === 0) {
      return NextResponse.json({ success: true, message: "No commitments yet" });
    }

    // Read all commitments
    const commitments: string[] = [];
    for (let i = 0; i < count; i++) {
      const res = await provider.callContract({
        contractAddress: PRIVACY_LAYER,
        entrypoint: "get_commitment_at",
        calldata: CallData.compile({ index: i }),
      });
      commitments.push(res[0]);
    }

    const newRoot = computeMerkleRoot(commitments);

    // Check if already up to date
    const currentRootRes = await provider.callContract({
      contractAddress: PRIVACY_LAYER,
      entrypoint: "get_merkle_root",
      calldata: [],
    });
    if (currentRootRes[0] === newRoot) {
      return NextResponse.json({ success: true, message: "Root already up to date", root: newRoot });
    }

    // Update root via AionVault.update_merkle_root
    const tx = await deployer.execute([{
      contractAddress: AION_VAULT,
      entrypoint: "update_merkle_root",
      calldata: [newRoot],
    }]);

    await provider.waitForTransaction(tx.transaction_hash);

    return NextResponse.json({
      success: true,
      root: newRoot,
      txHash: tx.transaction_hash,
      commitmentCount: count,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
