/// AION Yield — EkuboAdapter
/// Provides LP yield by supplying liquidity to Ekubo concentrated liquidity pools.
/// Upgrade over BitYield: replaces Troves with Ekubo for deeper Starknet liquidity.

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

// Ekubo core interface (simplified for adapter use)
#[starknet::interface]
pub trait IEkuboCore<TContractState> {
    fn mint_and_deposit(
        ref self: TContractState,
        pool_key: felt252,
        tick_lower: i128,
        tick_upper: i128,
        min_token0: u128,
        min_token1: u128,
        max_token0: u128,
        max_token1: u128,
        deadline: u64,
    ) -> (u128, u256, u256);

    fn collect_fees(ref self: TContractState, id: u64) -> (u256, u256);

    fn withdraw(
        ref self: TContractState,
        id: u64,
        min_token0: u128,
        min_token1: u128,
        deadline: u64,
    ) -> (u256, u256);
}

#[starknet::contract]
pub mod EkuboAdapter {
    use super::{IEkuboAdapter, IEkuboCoreDispatcher, IEkuboCoreDispatcherTrait};
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_block_timestamp};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        Map, StorageMapReadAccess, StorageMapWriteAccess
    };
    use stark_hackathon::interfaces::IERC20::{IERC20Dispatcher, IERC20DispatcherTrait};

    // Ekubo Sepolia address
    const EKUBO_CORE_SEPOLIA: felt252 =
        0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        vault: ContractAddress,
        asset: ContractAddress,         // WBTC
        paired_token: ContractAddress,  // e.g. ETH for WBTC/ETH pool
        ekubo_core: ContractAddress,
        pool_key: felt252,
        tick_lower: i128,
        tick_upper: i128,
        position_id: u64,
        liquidity_held: u256,
        total_assets_tracked: u256,
        current_apy_bps: u32,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        LiquidityAdded: LiquidityAdded,
        LiquidityRemoved: LiquidityRemoved,
        FeesCollected: FeesCollected,
        PoolUpdated: PoolUpdated,
    }

    #[derive(Drop, starknet::Event)]
    pub struct LiquidityAdded { pub amount: u256, pub liquidity: u256 }
    #[derive(Drop, starknet::Event)]
    pub struct LiquidityRemoved { pub liquidity: u256, pub amount: u256 }
    #[derive(Drop, starknet::Event)]
    pub struct FeesCollected { pub amount: u256, pub timestamp: u64 }
    #[derive(Drop, starknet::Event)]
    pub struct PoolUpdated { pub pool_key: felt252 }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        vault: ContractAddress,
        asset: ContractAddress,
        paired_token: ContractAddress,
        ekubo_core: ContractAddress,
    ) {
        self.owner.write(owner);
        self.vault.write(vault);
        self.asset.write(asset);
        self.paired_token.write(paired_token);
        self.ekubo_core.write(ekubo_core);
        self.current_apy_bps.write(680); // default 6.8% APY from LP fees
        self.liquidity_held.write(0);
        self.total_assets_tracked.write(0);
    }

    #[abi(embed_v0)]
    impl EkuboAdapterImpl of IEkuboAdapter<ContractState> {

        fn deposit(ref self: ContractState, amount: u256) -> u256 {
            self.assert_vault_or_owner();
            assert(amount > 0, 'Amount must be > 0');
            assert(self.pool_key.read() != 0, 'Pool not configured');

            let mut asset = IERC20Dispatcher { contract_address: self.asset.read() };
            let mut ekubo = IEkuboCoreDispatcher { contract_address: self.ekubo_core.read() };

            // Approve Ekubo to spend WBTC
            asset.approve(self.ekubo_core.read(), amount);

            let deadline = get_block_timestamp() + 300; // 5 min

            // Provide liquidity — amount in token0 (WBTC), token1 handled by pool ratio
            let (liquidity, _used0, _used1) = ekubo.mint_and_deposit(
                self.pool_key.read(),
                self.tick_lower.read(),
                self.tick_upper.read(),
                0,          // min token0
                0,          // min token1
                amount.low, // max token0
                0,          // max token1
                deadline,
            );

            let liq_u256: u256 = liquidity.into();
            let prev = self.liquidity_held.read();
            self.liquidity_held.write(prev + liq_u256);

            let prev_assets = self.total_assets_tracked.read();
            self.total_assets_tracked.write(prev_assets + amount);

            self.emit(LiquidityAdded { amount, liquidity: liq_u256 });
            liq_u256
        }

        fn withdraw(ref self: ContractState, liquidity: u256) -> u256 {
            self.assert_vault_or_owner();
            assert(liquidity > 0, 'Liquidity must be > 0');

            let held = self.liquidity_held.read();
            assert(liquidity <= held, 'Insufficient liquidity');

            let mut ekubo = IEkuboCoreDispatcher { contract_address: self.ekubo_core.read() };
            let deadline = get_block_timestamp() + 300;
            let position_id = self.position_id.read();

            let (amount0, _amount1) = ekubo.withdraw(position_id, 0, 0, deadline);
            self.liquidity_held.write(held - liquidity);

            // Track reduction
            let prev = self.total_assets_tracked.read();
            let reduction = if amount0 > prev { prev } else { amount0 };
            self.total_assets_tracked.write(prev - reduction);

            self.emit(LiquidityRemoved { liquidity, amount: amount0 });
            amount0
        }

        fn withdraw_all(ref self: ContractState) -> u256 {
            self.assert_vault_or_owner();
            let liquidity = self.liquidity_held.read();
            if liquidity == 0 { return 0; }
            self.withdraw(liquidity)
        }

        fn get_total_assets(self: @ContractState) -> u256 {
            self.total_assets_tracked.read()
        }

        fn get_current_apy_bps(self: @ContractState) -> u32 {
            self.current_apy_bps.read()
        }

        fn set_pool(ref self: ContractState, pool_key: felt252, tick_lower: i128, tick_upper: i128) {
            self.assert_owner();
            self.pool_key.write(pool_key);
            self.tick_lower.write(tick_lower);
            self.tick_upper.write(tick_upper);
            self.emit(PoolUpdated { pool_key });
        }

        fn set_vault(ref self: ContractState, vault: ContractAddress) {
            self.assert_owner();
            self.vault.write(vault);
        }

        fn collect_fees(ref self: ContractState) -> u256 {
            self.assert_vault_or_owner();
            let mut ekubo = IEkuboCoreDispatcher { contract_address: self.ekubo_core.read() };
            let position_id = self.position_id.read();

            let (fee0, _fee1) = ekubo.collect_fees(position_id);

            // Send collected fees to vault
            if fee0 > 0 {
                let mut asset = IERC20Dispatcher { contract_address: self.asset.read() };
                asset.transfer(self.vault.read(), fee0);
            }

            self.emit(FeesCollected { amount: fee0, timestamp: get_block_timestamp() });
            fee0
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
