use starknet::ContractAddress;

#[starknet::interface]
pub trait IEkuboAdapter<TContractState> {
    fn deposit(ref self: TContractState, amount: u256) -> u256;
    fn withdraw(ref self: TContractState, liquidity: u256) -> u256;
    fn withdraw_all(ref self: TContractState) -> u256;
    fn get_total_assets(self: @TContractState) -> u256;
    fn get_current_apy_bps(self: @TContractState) -> u32;
    fn set_pool(ref self: TContractState, pool_key: felt252, tick_lower: i128, tick_upper: i128);
    fn set_vault(ref self: TContractState, vault: ContractAddress);
    fn collect_fees(ref self: TContractState) -> u256;
}
