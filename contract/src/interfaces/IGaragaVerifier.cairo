/// Garaga UltraKeccakHonk verifier interface.
///
/// Garaga is a ZK proof verifier library for Starknet:
/// https://github.com/keep-starknet-strange/garaga
///
/// The verifier accepts a Noir-generated UltraHonk proof (packed as felt252
/// values alongside hints for efficient on-chain verification) and returns
/// the extracted public inputs if the proof is valid.
///
/// Proof format: `full_proof_with_hints` is produced by running:
///   nargo prove  (generate the Noir proof)
///   garaga calldata  (convert to Starknet calldata)
///
/// Public input layout for the AION circuit (in order):
///   [0] root              — Merkle root (felt252 as u256)
///   [1] nullifier_hash    — Poseidon2(nullifier) (felt252 as u256)
///   [2] recipient         — Starknet address (felt252 as u256)
///   [3] denomination_tier — 0–3 (u8 as u256)

use starknet::ContractAddress;

#[starknet::interface]
pub trait IGaragaVerifier<TContractState> {
    /// Verify a Noir UltraKeccakHonk proof.
    ///
    /// Returns `Option::Some(public_inputs)` if the proof is valid,
    /// where `public_inputs` is a span of u256 field elements in the order
    /// they were declared as `pub` in the Noir circuit.
    ///
    /// Returns `Option::None` if the proof is invalid.
    fn verify_ultra_keccak_honk_proof(
        self: @TContractState,
        full_proof_with_hints: Span<felt252>,
    ) -> Option<Span<u256>>;
}
