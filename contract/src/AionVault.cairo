/// AION Yield — AionVault (Core Contract)
/// The main entry point combining:
///   - ERC4626-style public deposits (aionWBTC shares)
///   - Commitment-based private deposits (shielded positions, amount hidden on-chain)
///   - Dual yield via Vesu + Ekubo through StrategyRouter
///   - ZK-ready private withdrawals via PrivacyLayer Merkle proofs
///
/// Architecture draws from BitYield Protocol vault + Stark Cloak mixer pattern.
/// Upgrade: adds privacy layer, AVNU routing, Ekubo LP yield.

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
    pub is_paused: bool,
}

#[starknet::interface]
pub trait IAionVault<TContractState> {
    // ── Public ERC4626 flow ──────────────────────────────────────────────────
    fn deposit(ref self: TContractState, assets: u256) -> u256;
    fn withdraw(ref self: TContractState, shares: u256) -> u256;
    // ── Private flow ─────────────────────────────────────────────────────────
    fn deposit_private(ref self: TContractState, commitment: felt252, assets: u256);
    fn withdraw_private(
        ref self: TContractState,
        merkle_proof: Span<felt252>,
        secret: felt252,
        nullifier: felt252,
        recipient: ContractAddress,
        amount: u256
    );
    // ── View ──────────────────────────────────────────────────────────────────
    fn total_assets(self: @TContractState) -> u256;
    fn convert_to_shares(self: @TContractState, assets: u256) -> u256;
    fn convert_to_assets(self: @TContractState, shares: u256) -> u256;
    fn get_config(self: @TContractState) -> VaultConfig;
    fn get_apy_bps(self: @TContractState) -> u32;
    fn get_tvl(self: @TContractState) -> u256;
    fn get_share_balance(self: @TContractState, account: ContractAddress) -> u256;
    fn get_total_shares(self: @TContractState) -> u256;
    // ── Admin ─────────────────────────────────────────────────────────────────
    fn rebalance(ref self: TContractState, vesu_target_bps: u32, ekubo_target_bps: u32);
    fn harvest_yield(ref self: TContractState);
    fn collect_fees(ref self: TContractState);
    fn emergency_withdraw(ref self: TContractState);
    fn pause(ref self: TContractState);
    fn unpause(ref self: TContractState);
    fn update_fees(ref self: TContractState, performance_fee_bps: u32, management_fee_bps: u32);
    fn update_merkle_root(ref self: TContractState, new_root: felt252);
}

#[starknet::contract]
pub mod AionVault {
    use super::{IAionVault, VaultConfig};
    use starknet::{
        ContractAddress, get_caller_address, get_contract_address, get_block_timestamp
    };
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        Map, StorageMapReadAccess, StorageMapWriteAccess
    };
    use stark_hackathon::interfaces::IERC20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use stark_hackathon::PrivacyLayer::{IPrivacyLayerDispatcher, IPrivacyLayerDispatcherTrait};
    use stark_hackathon::StrategyRouter::{IStrategyRouterDispatcher, IStrategyRouterDispatcherTrait};
    use core::poseidon::poseidon_hash_span;
    use core::num::traits::Zero;

    // Default fees (basis points)
    const DEFAULT_PERFORMANCE_FEE_BPS: u32 = 100;  // 1%
    const DEFAULT_MANAGEMENT_FEE_BPS: u32 = 50;    // 0.5%
    const BPS_DENOMINATOR: u256 = 10000;

    #[storage]
    struct Storage {
        // Config
        asset: ContractAddress,
        privacy_layer: ContractAddress,
        strategy_router: ContractAddress,
        vesu_adapter: ContractAddress,
        ekubo_adapter: ContractAddress,
        owner: ContractAddress,
        fee_recipient: ContractAddress,
        performance_fee_bps: u32,
        management_fee_bps: u32,
        is_paused: bool,
        // ERC20-like share token state
        shares: Map<ContractAddress, u256>,
        total_shares: u256,
        // Private deposit tracking (separate pool)
        private_pool: u256,   // Total WBTC in private positions
        // Fee accrual
        accrued_fees: u256,
        last_fee_collection: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Deposit: Deposit,
        DepositPrivate: DepositPrivate,
        Withdraw: Withdraw,
        WithdrawPrivate: WithdrawPrivate,
        Rebalanced: Rebalanced,
        YieldHarvested: YieldHarvested,
        FeesCollected: FeesCollected,
        Paused: Paused,
        Unpaused: Unpaused,
        MerkleRootUpdated: MerkleRootUpdated,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Deposit {
        pub user: ContractAddress,
        pub assets: u256,
        pub shares: u256,
    }
    #[derive(Drop, starknet::Event)]
    pub struct DepositPrivate {
        pub commitment: felt252,   // amount is hidden — only hash stored
        pub timestamp: u64,
    }
    #[derive(Drop, starknet::Event)]
    pub struct Withdraw {
        pub user: ContractAddress,
        pub shares: u256,
        pub assets: u256,
    }
    #[derive(Drop, starknet::Event)]
    pub struct WithdrawPrivate {
        pub recipient: ContractAddress,
        pub nullifier_hash: felt252,
        pub timestamp: u64,
    }
    #[derive(Drop, starknet::Event)]
    pub struct Rebalanced { pub vesu_bps: u32, pub ekubo_bps: u32 }
    #[derive(Drop, starknet::Event)]
    pub struct YieldHarvested { pub amount: u256 }
    #[derive(Drop, starknet::Event)]
    pub struct FeesCollected { pub amount: u256 }
    #[derive(Drop, starknet::Event)]
    pub struct Paused {}
    #[derive(Drop, starknet::Event)]
    pub struct Unpaused {}
    #[derive(Drop, starknet::Event)]
    pub struct MerkleRootUpdated { pub new_root: felt252 }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        asset: ContractAddress,
        privacy_layer: ContractAddress,
        strategy_router: ContractAddress,
        vesu_adapter: ContractAddress,
        ekubo_adapter: ContractAddress,
        fee_recipient: ContractAddress,
    ) {
        self.owner.write(owner);
        self.asset.write(asset);
        self.privacy_layer.write(privacy_layer);
        self.strategy_router.write(strategy_router);
        self.vesu_adapter.write(vesu_adapter);
        self.ekubo_adapter.write(ekubo_adapter);
        self.fee_recipient.write(fee_recipient);
        self.performance_fee_bps.write(DEFAULT_PERFORMANCE_FEE_BPS);
        self.management_fee_bps.write(DEFAULT_MANAGEMENT_FEE_BPS);
        self.is_paused.write(false);
        self.total_shares.write(0);
        self.private_pool.write(0);
        self.accrued_fees.write(0);
        self.last_fee_collection.write(get_block_timestamp());
    }

    #[abi(embed_v0)]
    impl AionVaultImpl of IAionVault<ContractState> {

        // ─────────────────────────────────────────────────────────────────────
        // PUBLIC DEPOSIT — standard ERC4626-style, position visible on-chain
        // ─────────────────────────────────────────────────────────────────────
        fn deposit(ref self: ContractState, assets: u256) -> u256 {
            self.assert_not_paused();
            assert(assets > 0, 'Deposit: zero assets');
            let caller = get_caller_address();

            // Pull WBTC from user
            let mut asset_token = IERC20Dispatcher { contract_address: self.asset.read() };
            asset_token.transfer_from(caller, get_contract_address(), assets);

            // Calculate shares to mint
            let shares = self.convert_to_shares(assets);
            assert(shares > 0, 'Deposit: zero shares');

            // Mint shares
            let prev = self.shares.read(caller);
            self.shares.write(caller, prev + shares);
            let total = self.total_shares.read();
            self.total_shares.write(total + shares);

            // Deploy capital to yield strategies
            asset_token.approve(self.strategy_router.read(), assets);
            let mut router = IStrategyRouterDispatcher { contract_address: self.strategy_router.read() };
            router.deposit_to_strategies(assets);

            self.emit(Deposit { user: caller, assets, shares });
            shares
        }

        // ─────────────────────────────────────────────────────────────────────
        // PRIVATE DEPOSIT — commitment stored on-chain, amount is hidden
        // Users generate (secret, nullifier) off-chain and compute:
        //   commitment = poseidon_hash(secret, nullifier)
        // ─────────────────────────────────────────────────────────────────────
        fn deposit_private(ref self: ContractState, commitment: felt252, assets: u256) {
            self.assert_not_paused();
            assert(assets > 0, 'Private deposit: zero assets');
            assert(commitment != 0, 'Private dep: empty commit');

            let caller = get_caller_address();
            let mut asset_token = IERC20Dispatcher { contract_address: self.asset.read() };

            // Pull WBTC — this is the only public link (caller → vault)
            // Amount goes into a shared private pool, not user-mapped storage
            asset_token.transfer_from(caller, get_contract_address(), assets);

            // Register commitment in PrivacyLayer (only hash stored, not amount)
            let mut privacy = IPrivacyLayerDispatcher { contract_address: self.privacy_layer.read() };
            privacy.register_commitment(commitment);

            // Add to shared private pool and deploy to strategies
            let prev_pool = self.private_pool.read();
            self.private_pool.write(prev_pool + assets);

            asset_token.approve(self.strategy_router.read(), assets);
            let mut router = IStrategyRouterDispatcher { contract_address: self.strategy_router.read() };
            router.deposit_to_strategies(assets);

            // Emit only commitment, NOT amount or caller
            self.emit(DepositPrivate {
                commitment,
                timestamp: get_block_timestamp(),
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // PUBLIC WITHDRAW — burns shares, returns WBTC
        // ─────────────────────────────────────────────────────────────────────
        fn withdraw(ref self: ContractState, shares: u256) -> u256 {
            self.assert_not_paused();
            assert(shares > 0, 'Withdraw: zero shares');

            let caller = get_caller_address();
            let user_shares = self.shares.read(caller);
            assert(user_shares >= shares, 'Withdraw: insufficient shares');

            let assets = self.convert_to_assets(shares);

            // Burn shares
            self.shares.write(caller, user_shares - shares);
            let total = self.total_shares.read();
            self.total_shares.write(total - shares);

            // Withdraw from strategies
            let mut router = IStrategyRouterDispatcher { contract_address: self.strategy_router.read() };
            let actual = router.withdraw_from_strategies(assets);

            // Deduct performance fee on yield
            let fee_amount = self.calc_performance_fee(actual, assets);
            let net = if actual > fee_amount { actual - fee_amount } else { actual };
            self.accrued_fees.write(self.accrued_fees.read() + fee_amount);

            // Transfer net WBTC to user
            let mut asset_token = IERC20Dispatcher { contract_address: self.asset.read() };
            asset_token.transfer(caller, net);

            self.emit(Withdraw { user: caller, shares, assets: net });
            net
        }

        // ─────────────────────────────────────────────────────────────────────
        // PRIVATE WITHDRAW — Merkle proof verifies commitment, nullifier
        // prevents double-spend. Recipient can differ from depositor.
        // ─────────────────────────────────────────────────────────────────────
        fn withdraw_private(
            ref self: ContractState,
            merkle_proof: Span<felt252>,
            secret: felt252,
            nullifier: felt252,
            recipient: ContractAddress,
            amount: u256
        ) {
            self.assert_not_paused();
            assert(amount > 0, 'Private withdraw: zero amount');
            assert(recipient.is_non_zero(), 'Priv withdraw: zero addr');

            // Verify proof and mark nullifier spent via PrivacyLayer
            let mut privacy = IPrivacyLayerDispatcher { contract_address: self.privacy_layer.read() };
            let valid = privacy.verify_and_nullify(merkle_proof, secret, nullifier, amount);
            assert(valid, 'Private withdraw: invalid proof');

            // Withdraw from strategies
            let mut router = IStrategyRouterDispatcher { contract_address: self.strategy_router.read() };
            let actual = router.withdraw_from_strategies(amount);

            // Update private pool accounting
            let pool = self.private_pool.read();
            let reduction = if amount > pool { pool } else { amount };
            self.private_pool.write(pool - reduction);

            // Transfer to recipient — sender is not linked to recipient on-chain
            let mut asset_token = IERC20Dispatcher { contract_address: self.asset.read() };
            asset_token.transfer(recipient, actual);

            // Nullifier hash for event (doesn't reveal secret)
            let nullifier_hash = poseidon_hash_span(array![nullifier].span());

            self.emit(WithdrawPrivate {
                recipient,
                nullifier_hash,
                timestamp: get_block_timestamp(),
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // VIEW FUNCTIONS
        // ─────────────────────────────────────────────────────────────────────
        fn total_assets(self: @ContractState) -> u256 {
            let router = IStrategyRouterDispatcher { contract_address: self.strategy_router.read() };
            router.get_total_assets()
        }

        fn convert_to_shares(self: @ContractState, assets: u256) -> u256 {
            let total_supply = self.total_shares.read();
            let total = self.total_assets();
            if total_supply == 0 || total == 0 {
                assets // 1:1 on first deposit
            } else {
                (assets * total_supply) / total
            }
        }

        fn convert_to_assets(self: @ContractState, shares: u256) -> u256 {
            let total_supply = self.total_shares.read();
            let total = self.total_assets();
            if total_supply == 0 {
                shares
            } else {
                (shares * total) / total_supply
            }
        }

        fn get_config(self: @ContractState) -> VaultConfig {
            VaultConfig {
                asset: self.asset.read(),
                privacy_layer: self.privacy_layer.read(),
                strategy_router: self.strategy_router.read(),
                vesu_adapter: self.vesu_adapter.read(),
                ekubo_adapter: self.ekubo_adapter.read(),
                performance_fee_bps: self.performance_fee_bps.read(),
                management_fee_bps: self.management_fee_bps.read(),
                fee_recipient: self.fee_recipient.read(),
                is_paused: self.is_paused.read(),
            }
        }

        fn get_apy_bps(self: @ContractState) -> u32 {
            let router = IStrategyRouterDispatcher { contract_address: self.strategy_router.read() };
            router.get_blended_apy_bps()
        }

        fn get_tvl(self: @ContractState) -> u256 {
            self.total_assets()
        }

        fn get_share_balance(self: @ContractState, account: ContractAddress) -> u256 {
            self.shares.read(account)
        }

        fn get_total_shares(self: @ContractState) -> u256 {
            self.total_shares.read()
        }

        // ─────────────────────────────────────────────────────────────────────
        // ADMIN FUNCTIONS
        // ─────────────────────────────────────────────────────────────────────
        fn rebalance(ref self: ContractState, vesu_target_bps: u32, ekubo_target_bps: u32) {
            self.assert_owner();
            let mut router = IStrategyRouterDispatcher { contract_address: self.strategy_router.read() };
            router.rebalance(vesu_target_bps, ekubo_target_bps);
            self.emit(Rebalanced { vesu_bps: vesu_target_bps, ekubo_bps: ekubo_target_bps });
        }

        fn harvest_yield(ref self: ContractState) {
            self.assert_owner();
            let mut router = IStrategyRouterDispatcher { contract_address: self.strategy_router.read() };
            let harvested = router.harvest_yield();
            self.emit(YieldHarvested { amount: harvested });
        }

        fn collect_fees(ref self: ContractState) {
            self.assert_owner();
            let fees = self.accrued_fees.read();
            if fees == 0 { return; }
            self.accrued_fees.write(0);
            let mut asset_token = IERC20Dispatcher { contract_address: self.asset.read() };
            asset_token.transfer(self.fee_recipient.read(), fees);
            self.emit(FeesCollected { amount: fees });
        }

        fn emergency_withdraw(ref self: ContractState) {
            self.assert_owner();
            let mut router = IStrategyRouterDispatcher { contract_address: self.strategy_router.read() };
            let total = router.get_total_assets();
            if total > 0 {
                router.withdraw_from_strategies(total);
            }
            self.is_paused.write(true);
        }

        fn pause(ref self: ContractState) {
            self.assert_owner();
            self.is_paused.write(true);
            self.emit(Paused {});
        }

        fn unpause(ref self: ContractState) {
            self.assert_owner();
            self.is_paused.write(false);
            self.emit(Unpaused {});
        }

        fn update_fees(ref self: ContractState, performance_fee_bps: u32, management_fee_bps: u32) {
            self.assert_owner();
            assert(performance_fee_bps <= 2000, 'Performance fee > 20%');
            assert(management_fee_bps <= 500, 'Management fee > 5%');
            self.performance_fee_bps.write(performance_fee_bps);
            self.management_fee_bps.write(management_fee_bps);
        }

        fn update_merkle_root(ref self: ContractState, new_root: felt252) {
            self.assert_owner();
            let mut privacy = IPrivacyLayerDispatcher { contract_address: self.privacy_layer.read() };
            privacy.update_root(new_root);
            self.emit(MerkleRootUpdated { new_root });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_owner(self: @ContractState) {
            assert(get_caller_address() == self.owner.read(), 'Not owner');
        }

        fn assert_not_paused(self: @ContractState) {
            assert(!self.is_paused.read(), 'Vault is paused');
        }

        fn calc_performance_fee(self: @ContractState, actual: u256, principal: u256) -> u256 {
            if actual <= principal { return 0; }
            let yield_amount = actual - principal;
            let fee_bps: u256 = self.performance_fee_bps.read().into();
            (yield_amount * fee_bps) / BPS_DENOMINATOR
        }
    }
}
