use starknet::ContractAddress;

#[derive(Drop, Copy, Serde, starknet::Store)]
pub struct AllocationTargets {
    pub vesu_bps: u32,
    pub ekubo_bps: u32,
    pub idle_bps: u32,
}

#[derive(Drop, Copy, Serde, starknet::Store)]
pub struct StrategyPerformance {
    pub total_deposited: u256,
    pub total_withdrawn: u256,
    pub yield_earned: u256,
    pub last_apy_bps: u32,
    pub last_update: u64,
}

#[starknet::interface]
pub trait IStrategyRouter<TContractState> {
    fn deposit_to_strategies(ref self: TContractState, amount: u256);
    fn withdraw_from_strategies(ref self: TContractState, amount: u256);
    fn rebalance(ref self: TContractState, vesu_target_bps: u32, ekubo_target_bps: u32);
    fn harvest_yield(ref self: TContractState) -> u256;
    fn get_total_assets(self: @TContractState) -> u256;
    fn get_blended_apy(self: @TContractState) -> u32;
    fn get_targets(self: @TContractState) -> AllocationTargets;
    fn get_performance(self: @TContractState, strategy: felt252) -> StrategyPerformance;
    fn needs_rebalance(self: @TContractState) -> bool;
    fn set_rebalancer(ref self: TContractState, rebalancer: ContractAddress);
    fn update_targets(ref self: TContractState, vesu_bps: u32, ekubo_bps: u32);
}
