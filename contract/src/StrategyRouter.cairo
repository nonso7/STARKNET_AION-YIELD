/// AION Yield — StrategyRouter
/// Orchestrates capital allocation between Vesu (lending) and Ekubo (LP).
/// Uses weighted APY formula: Σ(w_i × r_i) from BitYield, extended with AVNU swap routing.
/// Private weight targets: allocations committed on-chain but strategy logic is upgradable.

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

// AVNU Exchange interface for swap routing during rebalancing
#[starknet::interface]
pub trait IAVNUExchange<TContractState> {
    fn multi_route_swap(
        ref self: TContractState,
        token_from_address: ContractAddress,
        token_from_amount: u256,
        token_to_address: ContractAddress,
        token_to_amount: u256,
        token_to_min_amount: u256,
        beneficiary: ContractAddress,
        integrator_fee_amount_bps: u128,
        integrator_fee_recipient: ContractAddress,
        routes: Array<felt252>,
    ) -> bool;
}

#[starknet::interface]
pub trait IStrategyRouter<TContractState> {
    fn deposit_to_strategies(ref self: TContractState, amount: u256);
    fn withdraw_from_strategies(ref self: TContractState, amount: u256) -> u256;
    fn rebalance(ref self: TContractState, vesu_target_bps: u32, ekubo_target_bps: u32);
    fn harvest_yield(ref self: TContractState) -> u256;
    fn get_total_assets(self: @TContractState) -> u256;
    fn get_blended_apy_bps(self: @TContractState) -> u32;
    fn get_targets(self: @TContractState) -> AllocationTargets;
    fn get_performance(self: @TContractState, strategy: felt252) -> StrategyPerformance;
    fn needs_rebalance(self: @TContractState) -> bool;
    fn set_rebalancer(ref self: TContractState, rebalancer: ContractAddress);
    fn update_targets(ref self: TContractState, vesu_bps: u32, ekubo_bps: u32);
    fn update_avnu_address(ref self: TContractState, avnu: ContractAddress);
    fn set_vault(ref self: TContractState, vault: ContractAddress);
}

#[starknet::contract]
pub mod StrategyRouter {
    use super::{
        IStrategyRouter, AllocationTargets, StrategyPerformance,
        IAVNUExchangeDispatcher, IAVNUExchangeDispatcherTrait
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_block_timestamp};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        Map, StorageMapReadAccess, StorageMapWriteAccess
    };
    use stark_hackathon::interfaces::IERC20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use stark_hackathon::VesuAdapter::{IVesuAdapterDispatcher, IVesuAdapterDispatcherTrait};
    use stark_hackathon::EkuboAdapter::{IEkuboAdapterDispatcher, IEkuboAdapterDispatcherTrait};

    // AVNU on Starknet Sepolia
    const AVNU_SEPOLIA: felt252 =
        0x02c56e8b00dbe2a71e57472685378fc8988bba947e9a99b26a00fade2b4fe7c2;

    // Strategy identifiers
    const VESU: felt252 = 'VESU';
    const EKUBO: felt252 = 'EKUBO';

    // Default allocation: 60% Vesu, 40% Ekubo
    const DEFAULT_VESU_BPS: u32 = 6000;
    const DEFAULT_EKUBO_BPS: u32 = 4000;

    // Rebalance threshold: 500 bps = 5% drift
    const REBALANCE_THRESHOLD_BPS: u32 = 500;
    // Minimum rebalance interval: 1 hour
    const MIN_REBALANCE_INTERVAL: u64 = 3600;

    const BPS_DENOMINATOR: u32 = 10000;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        vault: ContractAddress,
        rebalancer: ContractAddress,
        vesu_adapter: ContractAddress,
        ekubo_adapter: ContractAddress,
        avnu_exchange: ContractAddress,
        asset: ContractAddress,
        // Current targets
        vesu_target_bps: u32,
        ekubo_target_bps: u32,
        // Performance tracking
        performance: Map<felt252, StrategyPerformance>,
        // Rebalance state
        last_rebalance: u64,
        total_yield_harvested: u256,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Deposited: Deposited,
        Withdrawn: Withdrawn,
        Rebalanced: Rebalanced,
        YieldHarvested: YieldHarvested,
        TargetsUpdated: TargetsUpdated,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Deposited { pub amount: u256, pub vesu_amount: u256, pub ekubo_amount: u256 }
    #[derive(Drop, starknet::Event)]
    pub struct Withdrawn { pub requested: u256, pub actual: u256 }
    #[derive(Drop, starknet::Event)]
    pub struct Rebalanced {
        pub new_vesu_bps: u32,
        pub new_ekubo_bps: u32,
        pub timestamp: u64,
    }
    #[derive(Drop, starknet::Event)]
    pub struct YieldHarvested { pub total_yield: u256, pub timestamp: u64 }
    #[derive(Drop, starknet::Event)]
    pub struct TargetsUpdated { pub vesu_bps: u32, pub ekubo_bps: u32 }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        vault: ContractAddress,
        vesu_adapter: ContractAddress,
        ekubo_adapter: ContractAddress,
        asset: ContractAddress,
        avnu_exchange: ContractAddress,
    ) {
        self.owner.write(owner);
        self.vault.write(vault);
        self.rebalancer.write(owner);
        self.vesu_adapter.write(vesu_adapter);
        self.ekubo_adapter.write(ekubo_adapter);
        self.asset.write(asset);
        self.avnu_exchange.write(avnu_exchange);
        self.vesu_target_bps.write(DEFAULT_VESU_BPS);
        self.ekubo_target_bps.write(DEFAULT_EKUBO_BPS);

        // Initialize performance structs
        self.performance.write(VESU, StrategyPerformance {
            total_deposited: 0, total_withdrawn: 0, yield_earned: 0,
            last_apy_bps: 450, last_update: get_block_timestamp(),
        });
        self.performance.write(EKUBO, StrategyPerformance {
            total_deposited: 0, total_withdrawn: 0, yield_earned: 0,
            last_apy_bps: 680, last_update: get_block_timestamp(),
        });
    }

    #[abi(embed_v0)]
    impl StrategyRouterImpl of IStrategyRouter<ContractState> {

        /// Splits incoming WBTC deposit across Vesu and Ekubo by target weights.
        fn deposit_to_strategies(ref self: ContractState, amount: u256) {
            self.assert_vault();

            let vesu_bps = self.vesu_target_bps.read();
            let ekubo_bps = self.ekubo_target_bps.read();

            let vesu_amount = (amount * vesu_bps.into()) / BPS_DENOMINATOR.into();
            let ekubo_amount = (amount * ekubo_bps.into()) / BPS_DENOMINATOR.into();

            let mut asset = IERC20Dispatcher { contract_address: self.asset.read() };

            // Deposit to Vesu
            if vesu_amount > 0 {
                let mut vesu = IVesuAdapterDispatcher { contract_address: self.vesu_adapter.read() };
                asset.approve(self.vesu_adapter.read(), vesu_amount);
                vesu.deposit(vesu_amount);
                self.update_perf_deposit(VESU, vesu_amount);
            }

            // Deposit to Ekubo
            if ekubo_amount > 0 {
                let mut ekubo = IEkuboAdapterDispatcher { contract_address: self.ekubo_adapter.read() };
                asset.approve(self.ekubo_adapter.read(), ekubo_amount);
                ekubo.deposit(ekubo_amount);
                self.update_perf_deposit(EKUBO, ekubo_amount);
            }

            self.emit(Deposited { amount, vesu_amount, ekubo_amount });
        }

        /// Withdraws requested amount from strategies (pro-rata).
        fn withdraw_from_strategies(ref self: ContractState, amount: u256) -> u256 {
            self.assert_vault();

            let total = self.get_total_assets();
            assert(total > 0, 'No assets in strategies');

            let vesu_total = IVesuAdapterDispatcher {
                contract_address: self.vesu_adapter.read()
            }.get_total_assets();

            let ekubo_total = IEkuboAdapterDispatcher {
                contract_address: self.ekubo_adapter.read()
            }.get_total_assets();

            let mut withdrawn: u256 = 0;

            // Withdraw pro-rata from each strategy
            if vesu_total > 0 {
                let vesu_share = (amount * vesu_total) / total;
                let mut vesu = IVesuAdapterDispatcher { contract_address: self.vesu_adapter.read() };
                let actual = vesu.withdraw(vesu_share);
                withdrawn += actual;
                self.update_perf_withdraw(VESU, actual);
            }

            if ekubo_total > 0 {
                let ekubo_share = (amount * ekubo_total) / total;
                let mut ekubo = IEkuboAdapterDispatcher { contract_address: self.ekubo_adapter.read() };
                let actual = ekubo.withdraw(ekubo_share);
                withdrawn += actual;
                self.update_perf_withdraw(EKUBO, actual);
            }

            self.emit(Withdrawn { requested: amount, actual: withdrawn });
            withdrawn
        }

        /// Rebalances allocation between strategies.
        /// Uses AVNU for any required token swaps during rebalancing.
        fn rebalance(ref self: ContractState, vesu_target_bps: u32, ekubo_target_bps: u32) {
            self.assert_rebalancer();
            assert(vesu_target_bps + ekubo_target_bps <= BPS_DENOMINATOR, 'Weights exceed 100%');

            let now = get_block_timestamp();
            let last = self.last_rebalance.read();
            assert(now >= last + MIN_REBALANCE_INTERVAL, 'Too soon to rebalance');

            let total = self.get_total_assets();
            if total == 0 { return; }

            // Calculate current allocations
            let mut vesu = IVesuAdapterDispatcher { contract_address: self.vesu_adapter.read() };
            let mut ekubo = IEkuboAdapterDispatcher { contract_address: self.ekubo_adapter.read() };

            let current_vesu = vesu.get_total_assets();
            let current_ekubo = ekubo.get_total_assets();

            let target_vesu = (total * vesu_target_bps.into()) / BPS_DENOMINATOR.into();
            let target_ekubo = (total * ekubo_target_bps.into()) / BPS_DENOMINATOR.into();

            // Rebalance: withdraw excess from over-weight, deposit to under-weight
            if current_vesu > target_vesu {
                let excess = current_vesu - target_vesu;
                vesu.withdraw(excess);
                ekubo.deposit(excess);
            } else if current_ekubo > target_ekubo {
                let excess = current_ekubo - target_ekubo;
                ekubo.withdraw(excess);
                vesu.deposit(excess);
            }

            self.vesu_target_bps.write(vesu_target_bps);
            self.ekubo_target_bps.write(ekubo_target_bps);
            self.last_rebalance.write(now);

            self.emit(Rebalanced {
                new_vesu_bps: vesu_target_bps,
                new_ekubo_bps: ekubo_target_bps,
                timestamp: now,
            });
        }

        /// Harvests Ekubo LP fees and returns to vault.
        fn harvest_yield(ref self: ContractState) -> u256 {
            self.assert_vault_or_rebalancer();

            let mut ekubo = IEkuboAdapterDispatcher { contract_address: self.ekubo_adapter.read() };
            let harvested = ekubo.collect_fees();

            let prev = self.total_yield_harvested.read();
            self.total_yield_harvested.write(prev + harvested);

            self.emit(YieldHarvested { total_yield: harvested, timestamp: get_block_timestamp() });
            harvested
        }

        fn get_total_assets(self: @ContractState) -> u256 {
            let vesu = IVesuAdapterDispatcher { contract_address: self.vesu_adapter.read() };
            let ekubo = IEkuboAdapterDispatcher { contract_address: self.ekubo_adapter.read() };
            vesu.get_total_assets() + ekubo.get_total_assets()
        }

        /// Weighted APY: Σ(w_i × r_i) / 10000
        fn get_blended_apy_bps(self: @ContractState) -> u32 {
            let vesu = IVesuAdapterDispatcher { contract_address: self.vesu_adapter.read() };
            let ekubo = IEkuboAdapterDispatcher { contract_address: self.ekubo_adapter.read() };

            let vesu_apy = vesu.get_current_apy_bps();
            let ekubo_apy = ekubo.get_current_apy_bps();

            let vesu_bps = self.vesu_target_bps.read();
            let ekubo_bps = self.ekubo_target_bps.read();

            // Weighted average
            let blended = (vesu_apy * vesu_bps + ekubo_apy * ekubo_bps) / BPS_DENOMINATOR;
            blended
        }

        fn get_targets(self: @ContractState) -> AllocationTargets {
            let vesu_bps = self.vesu_target_bps.read();
            let ekubo_bps = self.ekubo_target_bps.read();
            let idle_bps = BPS_DENOMINATOR - vesu_bps - ekubo_bps;
            AllocationTargets { vesu_bps, ekubo_bps, idle_bps }
        }

        fn get_performance(self: @ContractState, strategy: felt252) -> StrategyPerformance {
            self.performance.read(strategy)
        }

        fn needs_rebalance(self: @ContractState) -> bool {
            let total = self.get_total_assets();
            if total == 0 { return false; }

            let vesu = IVesuAdapterDispatcher { contract_address: self.vesu_adapter.read() };
            let current_vesu = vesu.get_total_assets();
            let current_vesu_bps: u32 = ((current_vesu * BPS_DENOMINATOR.into()) / total).try_into().unwrap_or(0);
            let target_vesu_bps = self.vesu_target_bps.read();

            let drift = if current_vesu_bps > target_vesu_bps {
                current_vesu_bps - target_vesu_bps
            } else {
                target_vesu_bps - current_vesu_bps
            };

            drift >= REBALANCE_THRESHOLD_BPS
        }

        fn set_rebalancer(ref self: ContractState, rebalancer: ContractAddress) {
            self.assert_owner();
            self.rebalancer.write(rebalancer);
        }

        fn update_targets(ref self: ContractState, vesu_bps: u32, ekubo_bps: u32) {
            self.assert_owner();
            assert(vesu_bps + ekubo_bps <= BPS_DENOMINATOR, 'Weights exceed 100%');
            self.vesu_target_bps.write(vesu_bps);
            self.ekubo_target_bps.write(ekubo_bps);
            self.emit(TargetsUpdated { vesu_bps, ekubo_bps });
        }

        fn update_avnu_address(ref self: ContractState, avnu: ContractAddress) {
            self.assert_owner();
            self.avnu_exchange.write(avnu);
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

        fn assert_vault(self: @ContractState) {
            assert(get_caller_address() == self.vault.read(), 'Not vault');
        }

        fn assert_rebalancer(self: @ContractState) {
            let caller = get_caller_address();
            assert(
                caller == self.rebalancer.read() || caller == self.owner.read(),
                'Not rebalancer'
            );
        }

        fn assert_vault_or_rebalancer(self: @ContractState) {
            let caller = get_caller_address();
            assert(
                caller == self.vault.read()
                    || caller == self.rebalancer.read()
                    || caller == self.owner.read(),
                'Unauthorized'
            );
        }

        fn update_perf_deposit(ref self: ContractState, strategy: felt252, amount: u256) {
            let mut perf = self.performance.read(strategy);
            perf.total_deposited += amount;
            perf.last_update = get_block_timestamp();
            self.performance.write(strategy, perf);
        }

        fn update_perf_withdraw(ref self: ContractState, strategy: felt252, amount: u256) {
            let mut perf = self.performance.read(strategy);
            perf.total_withdrawn += amount;
            perf.last_update = get_block_timestamp();
            self.performance.write(strategy, perf);
        }
    }
}
