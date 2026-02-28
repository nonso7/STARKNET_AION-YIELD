/// AION Yield — VesuAdapter
/// Deposits WBTC into Vesu lending pools to earn interest yield.
/// Based on BitYield Protocol's VesuAdapters.cairo, extended with APY tracking.

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

#[starknet::interface]
pub trait IVToken<TContractState> {
    fn deposit(ref self: TContractState, assets: u256, receiver: ContractAddress) -> u256;
    fn redeem(ref self: TContractState, shares: u256, receiver: ContractAddress, owner: ContractAddress) -> u256;
    fn convert_to_assets(self: @TContractState, shares: u256) -> u256;
    fn convert_to_shares(self: @TContractState, assets: u256) -> u256;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn total_assets(self: @TContractState) -> u256;
    fn approve(ref self: TContractState, spender: ContractAddress, amount: u256) -> bool;
}

#[starknet::contract]
pub mod VesuAdapter {
    use super::{IVesuAdapter, IVTokenDispatcher, IVTokenDispatcherTrait};
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_block_timestamp};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        Map, StorageMapReadAccess, StorageMapWriteAccess
    };
    use stark_hackathon::interfaces::IERC20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use core::num::traits::Zero;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        vault: ContractAddress,
        asset: ContractAddress,
        // pool_id -> vToken address
        v_tokens: Map<felt252, ContractAddress>,
        // pool_id list by index
        pool_ids: Map<u32, felt252>,
        pool_count: u32,
        // pool_id -> shares held
        pool_shares: Map<felt252, u256>,
        // Simulated APY (basis points) — updated by oracle/rebalancer
        current_apy_bps: u32,
        last_harvested: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        PoolAdded: PoolAdded,
        PoolRemoved: PoolRemoved,
        Deposited: Deposited,
        Withdrawn: Withdrawn,
        YieldHarvested: YieldHarvested,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PoolAdded { pub pool_id: felt252, pub v_token: ContractAddress }
    #[derive(Drop, starknet::Event)]
    pub struct PoolRemoved { pub pool_id: felt252 }
    #[derive(Drop, starknet::Event)]
    pub struct Deposited { pub amount: u256, pub shares: u256 }
    #[derive(Drop, starknet::Event)]
    pub struct Withdrawn { pub shares: u256, pub amount: u256 }
    #[derive(Drop, starknet::Event)]
    pub struct YieldHarvested { pub amount: u256, pub timestamp: u64 }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        vault: ContractAddress,
        asset: ContractAddress,
    ) {
        self.owner.write(owner);
        self.vault.write(vault);
        self.asset.write(asset);
        self.pool_count.write(0);
        self.current_apy_bps.write(450); // default 4.5% APY
    }

    #[abi(embed_v0)]
    impl VesuAdapterImpl of IVesuAdapter<ContractState> {

        fn deposit(ref self: ContractState, amount: u256) -> u256 {
            self.assert_vault_or_owner();
            assert(amount > 0, 'Amount must be > 0');

            let count = self.pool_count.read();
            assert(count > 0, 'No active pools');

            // Distribute evenly across all active pools
            let per_pool = amount / count.into();
            let mut total_shares: u256 = 0;
            let mut i: u32 = 0;

            loop {
                if i >= count { break; }
                let pool_id = self.pool_ids.read(i);
                if pool_id != 0 {
                    let v_token_addr = self.v_tokens.read(pool_id);
                    if v_token_addr.is_non_zero() {
                        let mut asset = IERC20Dispatcher { contract_address: self.asset.read() };
                        let mut v_token = IVTokenDispatcher { contract_address: v_token_addr };
                        asset.approve(v_token_addr, per_pool);
                        let shares = v_token.deposit(per_pool, get_contract_address());
                        let prev = self.pool_shares.read(pool_id);
                        self.pool_shares.write(pool_id, prev + shares);
                        total_shares += shares;
                    }
                }
                i += 1;
            };

            self.emit(Deposited { amount, shares: total_shares });
            total_shares
        }

        fn withdraw(ref self: ContractState, shares: u256) -> u256 {
            self.assert_vault_or_owner();
            assert(shares > 0, 'Shares must be > 0');

            let count = self.pool_count.read();
            let per_pool_shares = shares / count.into();
            let mut total_assets: u256 = 0;
            let mut i: u32 = 0;

            loop {
                if i >= count { break; }
                let pool_id = self.pool_ids.read(i);
                if pool_id != 0 {
                    let v_token_addr = self.v_tokens.read(pool_id);
                    if v_token_addr.is_non_zero() {
                        let v_token = IVTokenDispatcher { contract_address: v_token_addr };
                        let held = self.pool_shares.read(pool_id);
                        let to_redeem = if per_pool_shares > held { held } else { per_pool_shares };
                        if to_redeem > 0 {
                            let assets = v_token.redeem(to_redeem, self.vault.read(), get_contract_address());
                            let new_held = if held > to_redeem { held - to_redeem } else { 0 };
                            self.pool_shares.write(pool_id, new_held);
                            total_assets += assets;
                        }
                    }
                }
                i += 1;
            };

            self.emit(Withdrawn { shares, amount: total_assets });
            total_assets
        }

        fn withdraw_all(ref self: ContractState) -> u256 {
            self.assert_vault_or_owner();
            let count = self.pool_count.read();
            let mut total: u256 = 0;
            let mut i: u32 = 0;

            loop {
                if i >= count { break; }
                let pool_id = self.pool_ids.read(i);
                if pool_id != 0 {
                    let v_token_addr = self.v_tokens.read(pool_id);
                    let held = self.pool_shares.read(pool_id);
                    if held > 0 && v_token_addr.is_non_zero() {
                        let v_token = IVTokenDispatcher { contract_address: v_token_addr };
                        let assets = v_token.redeem(held, self.vault.read(), get_contract_address());
                        self.pool_shares.write(pool_id, 0);
                        total += assets;
                    }
                }
                i += 1;
            };
            total
        }

        fn get_total_assets(self: @ContractState) -> u256 {
            let count = self.pool_count.read();
            let mut total: u256 = 0;
            let mut i: u32 = 0;
            loop {
                if i >= count { break; }
                let pool_id = self.pool_ids.read(i);
                if pool_id != 0 {
                    let v_token_addr = self.v_tokens.read(pool_id);
                    let shares = self.pool_shares.read(pool_id);
                    if shares > 0 && v_token_addr.is_non_zero() {
                        let v_token = IVTokenDispatcher { contract_address: v_token_addr };
                        total += v_token.convert_to_assets(shares);
                    }
                }
                i += 1;
            };
            total
        }

        fn get_current_apy_bps(self: @ContractState) -> u32 {
            self.current_apy_bps.read()
        }

        fn add_pool(ref self: ContractState, pool_id: felt252, v_token: ContractAddress) {
            self.assert_owner();
            let count = self.pool_count.read();
            self.v_tokens.write(pool_id, v_token);
            self.pool_ids.write(count, pool_id);
            self.pool_count.write(count + 1);
            self.emit(PoolAdded { pool_id, v_token });
        }

        fn remove_pool(ref self: ContractState, pool_id: felt252) {
            self.assert_owner();
            self.v_tokens.write(pool_id, Zero::zero());
            self.emit(PoolRemoved { pool_id });
        }

        fn get_active_pools(self: @ContractState) -> Array<felt252> {
            let count = self.pool_count.read();
            let mut pools: Array<felt252> = array![];
            let mut i: u32 = 0;
            loop {
                if i >= count { break; }
                let pool_id = self.pool_ids.read(i);
                if pool_id != 0 {
                    pools.append(pool_id);
                }
                i += 1;
            };
            pools
        }

        fn set_vault(ref self: ContractState, vault: ContractAddress) {
            self.assert_owner();
            self.vault.write(vault);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_owner(self: @ContractState) {
            assert(get_caller_address() == self.owner.read(), 'Not owner');
        }

        fn assert_vault_or_owner(self: @ContractState) {
            let caller = get_caller_address();
            assert(
                caller == self.vault.read() || caller == self.owner.read(),
                'Not vault or owner'
            );
        }
    }
}
