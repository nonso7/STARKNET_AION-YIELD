use starknet::ContractAddress;

#[starknet::interface]
pub trait IPrivacyLayer<TContractState> {
    fn register_commitment(ref self: TContractState, commitment: felt252);
    fn verify_and_nullify(
        ref self: TContractState,
        merkle_proof: Span<felt252>,
        secret: felt252,
        nullifier: felt252,
        amount: u256
    ) -> bool;
    fn update_root(ref self: TContractState, new_root: felt252);
    fn get_merkle_root(self: @TContractState) -> felt252;
    fn get_commitment_at(self: @TContractState, index: u32) -> felt252;
    fn is_nullifier_spent(self: @TContractState, nullifier_hash: felt252) -> bool;
    fn get_total_commitments(self: @TContractState) -> u32;
}
