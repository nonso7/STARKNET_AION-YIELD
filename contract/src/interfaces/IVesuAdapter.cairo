use starknet::ContractAddress;

#[starknet::interface]
pub trait IVesuAdapter<TContractState> {
    fn deposit(ref self: TContractState, amount: u256) -> u256;
    fn withdraw(ref self: TContractState, shares: u256) -> u256;
    fn withdraw_all(ref self: TContractState) -> u256;
    fn get_total_assets(self: @TContractState) -> u256;
    fn get_current_apy_bps(self: @TContractState) -> u32;
    fn add_pool(ref self: TContractState, pool_id: felt252, v_token: ContractAddress);
    fn remove_pool(ref self: TContractState, pool_id: felt252);
    fn get_active_pools(self: @TContractState) -> Array<felt252>;
    fn set_vault(ref self: TContractState, vault: ContractAddress);
}
