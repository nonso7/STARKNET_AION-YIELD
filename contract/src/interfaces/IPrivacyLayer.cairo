use starknet::ContractAddress;

#[starknet::interface]
pub trait IPrivacyLayer<TContractState> {
    /// Register a new commitment hash on deposit.
    /// Called by AionVault — stores only the hash, never the amount.
    fn register_commitment(ref self: TContractState, commitment: felt252);

    /// ZK-based withdrawal verification via Garaga on-chain verifier.
    ///
    /// Accepts a Noir UltraKeccakHonk proof. Public inputs inside the proof
    /// must match: root, nullifier_hash, recipient, denomination_tier.
    /// Marks the nullifier spent on success to prevent double-withdrawal.
    fn verify_zk_and_nullify(
        ref self: TContractState,
        zk_proof: Span<felt252>,
        nullifier_hash: felt252,
        recipient: ContractAddress,
        denomination_tier: u8,
    ) -> bool;

    /// Update the Merkle root (owner / vault only).
    fn update_root(ref self: TContractState, new_root: felt252);

    /// Set the Garaga UltraKeccakHonk verifier contract address (owner only).
    fn set_garaga_verifier(ref self: TContractState, verifier: ContractAddress);

    /// Set the vault address permitted to call mutating functions.
    fn set_vault(ref self: TContractState, vault: ContractAddress);

    // ── View ───────────────────────────────────────────────────────────────
    fn get_merkle_root(self: @TContractState) -> felt252;
    fn get_commitment_at(self: @TContractState, index: u32) -> felt252;
    fn is_nullifier_spent(self: @TContractState, nullifier_hash: felt252) -> bool;
    fn get_total_commitments(self: @TContractState) -> u32;
    fn get_garaga_verifier(self: @TContractState) -> ContractAddress;

    /// Return the WBTC satoshi amount for a given denomination tier.
    fn get_denomination_amount(self: @TContractState, tier: u8) -> u256;
}
