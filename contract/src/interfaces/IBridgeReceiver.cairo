use starknet::ContractAddress;

#[derive(Drop, Copy, Serde, starknet::Store, PartialEq)]
pub enum BridgeStatus {
    Pending,
    Completed,
    Failed,
}

#[derive(Drop, Copy, Serde, starknet::Store)]
pub struct BridgeRequest {
    pub sender: ContractAddress,
    pub amount: u256,
    pub commitment: felt252,  // 0 = public deposit, nonzero = private
    pub status: BridgeStatus,
    pub timestamp: u64,
}

#[starknet::interface]
pub trait IBridgeReceiver<TContractState> {
    fn initiate_bridge(
        ref self: TContractState,
        btc_amount: u256,
        commitment: felt252,   // pass 0 for public, hash for private
        auto_deposit: bool
    ) -> felt252;              // returns request_id
    fn complete_bridge(ref self: TContractState, request_id: felt252, wbtc_amount: u256);
    fn get_request(self: @TContractState, request_id: felt252) -> BridgeRequest;
    fn update_bridge_address(ref self: TContractState, new_bridge: ContractAddress);
    fn update_vault_address(ref self: TContractState, new_vault: ContractAddress);
}
