use starknet::ContractAddress;

#[derive(Drop, Copy, Serde, starknet::Store)]
pub struct VaultConfig {
    pub asset: ContractAddress,
    pub privacy_layer: ContractAddress,
    pub strategy_router: ContractAddress,
    pub vesu_adapter: ContractAddress,
    pub ekubo_adapter: ContractAddress,
    pub performance_fee_bps: u32,
    pub management_fee_bps: u32,
    pub fee_recipient: ContractAddress,
    pub max_vesu_weight_bps: u32,
    pub max_ekubo_weight_bps: u32,
    pub is_paused: bool,
}

#[starknet::interface]
pub trait IAionVault<TContractState> {
    // Public deposit: standard ERC4626 (non-private)
    fn deposit(ref self: TContractState, assets: u256) -> u256;
    // Private deposit: commitment-based, amount hidden
    fn deposit_private(ref self: TContractState, commitment: felt252, assets: u256);
    // Public withdraw by shares
    fn withdraw(ref self: TContractState, shares: u256) -> u256;
    // Private withdraw: prove commitment preimage, nullifier prevents re-use
    fn withdraw_private(
        ref self: TContractState,
        merkle_proof: Span<felt252>,
        secret: felt252,
        nullifier: felt252,
        recipient: ContractAddress,
        amount: u256
    );
    // View
    fn total_assets(self: @TContractState) -> u256;
    fn total_private_assets(self: @TContractState) -> u256;
    fn convert_to_shares(self: @TContractState, assets: u256) -> u256;
    fn convert_to_assets(self: @TContractState, shares: u256) -> u256;
    fn get_config(self: @TContractState) -> VaultConfig;
    fn get_apy(self: @TContractState) -> u256;
    fn get_tvl(self: @TContractState) -> u256;
    // Admin
    fn rebalance(ref self: TContractState, vesu_target_bps: u32, ekubo_target_bps: u32);
    fn collect_fees(ref self: TContractState);
    fn emergency_withdraw(ref self: TContractState);
    fn pause(ref self: TContractState);
    fn unpause(ref self: TContractState);
    fn update_fees(ref self: TContractState, performance_fee_bps: u32, management_fee_bps: u32);
    fn update_merkle_root(ref self: TContractState, new_root: felt252);
}
