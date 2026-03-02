/// AION Yield — AionVault (Simplified — direct custody)
///
/// Architecture:
///   All WBTC is held directly in this contract (no external strategy routing).
///   Public depositors receive aToken shares proportional to their contribution.
///   Private depositors receive a privacy-preserving commitment note (ZK-enabled).
///
/// aToken share math (ERC-4626 style):
///   shares_out = assets * total_supply / total_public_assets   (or 1:1 when empty)
///   assets_out = shares  * total_public_assets / total_supply
///
/// Privacy model (unchanged):
///   deposit_private  → only commitment hash + tier index appear on-chain
///   withdraw_private → ZK proof verified by Garaga; secret never in calldata

use starknet::ContractAddress;

#[starknet::interface]
pub trait IAionVault<TContractState> {
    // ── Public vault ──────────────────────────────────────────────────────────
    fn deposit(ref self: TContractState, assets: u256) -> u256;
    fn withdraw(ref self: TContractState, shares: u256) -> u256;

    // ── Private vault (ZK) ───────────────────────────────────────────────────
    fn deposit_private(ref self: TContractState, commitment: felt252, denomination_tier: u8);
    fn withdraw_private(
        ref self: TContractState,
        zk_proof: Span<felt252>,
        nullifier_hash: felt252,
        recipient: ContractAddress,
        denomination_tier: u8,
    );

    // ── View ─────────────────────────────────────────────────────────────────
    fn total_assets(self: @TContractState) -> u256;
    fn convert_to_shares(self: @TContractState, assets: u256) -> u256;
    fn convert_to_assets(self: @TContractState, shares: u256) -> u256;
    fn get_apy_bps(self: @TContractState) -> u32;
    fn get_tvl(self: @TContractState) -> u256;
    fn get_share_balance(self: @TContractState, account: ContractAddress) -> u256;
    fn get_total_shares(self: @TContractState) -> u256;
    fn get_denomination_amount(self: @TContractState, tier: u8) -> u256;

    // ── Admin ─────────────────────────────────────────────────────────────────
    fn set_simulated_apy(ref self: TContractState, apy_bps: u32);
    fn set_garaga_verifier(ref self: TContractState, verifier: ContractAddress);
    fn update_merkle_root(ref self: TContractState, new_root: felt252);
    fn pause(ref self: TContractState);
    fn unpause(ref self: TContractState);
}

#[starknet::contract]
pub mod AionVault {
    use super::IAionVault;
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_block_timestamp};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        Map, StorageMapReadAccess, StorageMapWriteAccess
    };
    use stark_hackathon::interfaces::IERC20::{IERC20, IERC20Dispatcher, IERC20DispatcherTrait};
    use stark_hackathon::PrivacyLayer::{IPrivacyLayerDispatcher, IPrivacyLayerDispatcherTrait};
    use core::num::traits::Zero;

    // Denomination tiers in WBTC satoshis (8 decimals)
    const DENOM_0: u256 = 100_000;      // 0.001 WBTC
    const DENOM_1: u256 = 1_000_000;    // 0.01  WBTC
    const DENOM_2: u256 = 10_000_000;   // 0.1   WBTC
    const DENOM_3: u256 = 100_000_000;  // 1.0   WBTC

    // Default simulated APY: 5.5% = 550 bps
    const DEFAULT_APY_BPS: u32 = 550;

    #[storage]
    struct Storage {
        // Core
        owner: ContractAddress,
        asset: ContractAddress,           // MockWBTC
        privacy_layer: ContractAddress,
        is_paused: bool,

        // aToken (share) accounting
        shares: Map<ContractAddress, u256>,
        total_shares: u256,
        total_public_assets: u256,        // WBTC held for public depositors

        // Private pool accounting (separate from public shares)
        private_pool: u256,               // WBTC held for private note holders

        // ERC20 allowances for aToken
        allowances: Map<(ContractAddress, ContractAddress), u256>,

        // Simulated yield display
        simulated_apy_bps: u32,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Deposit: Deposit,
        Withdraw: Withdraw,
        DepositPrivate: DepositPrivate,
        WithdrawPrivate: WithdrawPrivate,
        Paused: Paused,
        Unpaused: Unpaused,
        MerkleRootUpdated: MerkleRootUpdated,
        Transfer: Transfer,
        Approval: Approval,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Deposit {
        pub user: ContractAddress,
        pub assets: u256,
        pub shares: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Withdraw {
        pub user: ContractAddress,
        pub shares: u256,
        pub assets: u256,
    }

    /// Voyager shows: commitment hash + tier index — NOT the amount
    #[derive(Drop, starknet::Event)]
    pub struct DepositPrivate {
        pub commitment: felt252,
        pub denomination_tier: u8,
        pub timestamp: u64,
    }

    /// Voyager shows: nullifier_hash (opaque) + recipient — no link to depositor
    #[derive(Drop, starknet::Event)]
    pub struct WithdrawPrivate {
        pub recipient: ContractAddress,
        pub nullifier_hash: felt252,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Paused {}

    #[derive(Drop, starknet::Event)]
    pub struct Unpaused {}

    #[derive(Drop, starknet::Event)]
    pub struct MerkleRootUpdated { pub new_root: felt252 }

    #[derive(Drop, starknet::Event)]
    pub struct Transfer {
        pub from: ContractAddress,
        pub to: ContractAddress,
        pub value: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Approval {
        pub owner: ContractAddress,
        pub spender: ContractAddress,
        pub value: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        asset: ContractAddress,
        privacy_layer: ContractAddress,
    ) {
        self.owner.write(owner);
        self.asset.write(asset);
        self.privacy_layer.write(privacy_layer);
        self.is_paused.write(false);
        self.total_shares.write(0);
        self.total_public_assets.write(0);
        self.private_pool.write(0);
        self.simulated_apy_bps.write(DEFAULT_APY_BPS);
    }

    #[abi(embed_v0)]
    impl AionVaultImpl of IAionVault<ContractState> {

        // ── Public deposit ────────────────────────────────────────────────────

        fn deposit(ref self: ContractState, assets: u256) -> u256 {
            self.assert_not_paused();
            assert(assets > 0, 'Deposit: zero assets');

            let caller = get_caller_address();
            let token = IERC20Dispatcher { contract_address: self.asset.read() };
            token.transfer_from(caller, get_contract_address(), assets);

            let shares = self.convert_to_shares(assets);
            assert(shares > 0, 'Deposit: zero shares');

            self._mint(caller, shares);
            self.total_public_assets.write(self.total_public_assets.read() + assets);

            self.emit(Deposit { user: caller, assets, shares });
            shares
        }

        // ── Public withdraw ───────────────────────────────────────────────────

        fn withdraw(ref self: ContractState, shares: u256) -> u256 {
            self.assert_not_paused();
            assert(shares > 0, 'Withdraw: zero shares');

            let caller = get_caller_address();
            assert(self.shares.read(caller) >= shares, 'Withdraw: insufficient shares');

            let assets = self.convert_to_assets(shares);
            assert(assets > 0, 'Withdraw: zero assets');

            self._burn(caller, shares);

            let held = self.total_public_assets.read();
            let reduction = if assets > held { held } else { assets };
            self.total_public_assets.write(held - reduction);

            let token = IERC20Dispatcher { contract_address: self.asset.read() };
            token.transfer(caller, assets);

            self.emit(Withdraw { user: caller, shares, assets });
            assets
        }

        // ── Private deposit ───────────────────────────────────────────────────
        //
        // Calldata on-chain: commitment (opaque hash) + denomination_tier (0-3)
        // The WBTC amount is derived from the tier inside the contract — never exposed.

        fn deposit_private(ref self: ContractState, commitment: felt252, denomination_tier: u8) {
            self.assert_not_paused();
            assert(commitment != 0, 'Private dep: empty commit');
            assert(denomination_tier <= 3, 'Invalid tier');

            let amount = self.tier_to_amount(denomination_tier);
            let caller = get_caller_address();

            let token = IERC20Dispatcher { contract_address: self.asset.read() };
            token.transfer_from(caller, get_contract_address(), amount);

            let mut privacy = IPrivacyLayerDispatcher {
                contract_address: self.privacy_layer.read()
            };
            privacy.register_commitment(commitment);

            self.private_pool.write(self.private_pool.read() + amount);

            self.emit(DepositPrivate {
                commitment,
                denomination_tier,
                timestamp: get_block_timestamp(),
            });
        }

        // ── Private withdraw ──────────────────────────────────────────────────
        //
        // secret and nullifier are NEVER in calldata.
        // A Noir ZK proof (verified by Garaga on-chain) proves ownership.

        fn withdraw_private(
            ref self: ContractState,
            zk_proof: Span<felt252>,
            nullifier_hash: felt252,
            recipient: ContractAddress,
            denomination_tier: u8,
        ) {
            self.assert_not_paused();
            assert(recipient.is_non_zero(), 'Priv withdraw: zero addr');
            assert(denomination_tier <= 3, 'Invalid tier');

            let amount = self.tier_to_amount(denomination_tier);

            let mut privacy = IPrivacyLayerDispatcher {
                contract_address: self.privacy_layer.read()
            };
            let valid = privacy.verify_zk_and_nullify(
                zk_proof, nullifier_hash, recipient, denomination_tier
            );
            assert(valid, 'Invalid ZK proof');

            let pool = self.private_pool.read();
            assert(pool >= amount, 'Insufficient private pool');
            self.private_pool.write(pool - amount);

            let token = IERC20Dispatcher { contract_address: self.asset.read() };
            token.transfer(recipient, amount);

            self.emit(WithdrawPrivate {
                recipient,
                nullifier_hash,
                timestamp: get_block_timestamp(),
            });
        }

        // ── View ──────────────────────────────────────────────────────────────

        fn total_assets(self: @ContractState) -> u256 {
            self.total_public_assets.read()
        }

        fn convert_to_shares(self: @ContractState, assets: u256) -> u256 {
            let supply = self.total_shares.read();
            let total = self.total_public_assets.read();
            if supply == 0 || total == 0 {
                assets // 1:1 for first depositor
            } else {
                (assets * supply) / total
            }
        }

        fn convert_to_assets(self: @ContractState, shares: u256) -> u256 {
            let supply = self.total_shares.read();
            if supply == 0 {
                shares
            } else {
                (shares * self.total_public_assets.read()) / supply
            }
        }

        fn get_apy_bps(self: @ContractState) -> u32 {
            self.simulated_apy_bps.read()
        }

        fn get_tvl(self: @ContractState) -> u256 {
            self.total_public_assets.read() + self.private_pool.read()
        }

        fn get_share_balance(self: @ContractState, account: ContractAddress) -> u256 {
            self.shares.read(account)
        }

        fn get_total_shares(self: @ContractState) -> u256 {
            self.total_shares.read()
        }

        fn get_denomination_amount(self: @ContractState, tier: u8) -> u256 {
            self.tier_to_amount(tier)
        }

        // ── Admin ─────────────────────────────────────────────────────────────

        fn set_simulated_apy(ref self: ContractState, apy_bps: u32) {
            self.assert_owner();
            assert(apy_bps <= 10000, 'APY > 100%');
            self.simulated_apy_bps.write(apy_bps);
        }

        fn set_garaga_verifier(ref self: ContractState, verifier: ContractAddress) {
            self.assert_owner();
            let mut privacy = IPrivacyLayerDispatcher {
                contract_address: self.privacy_layer.read()
            };
            privacy.set_garaga_verifier(verifier);
        }

        fn update_merkle_root(ref self: ContractState, new_root: felt252) {
            self.assert_owner();
            let mut privacy = IPrivacyLayerDispatcher {
                contract_address: self.privacy_layer.read()
            };
            privacy.update_root(new_root);
            self.emit(MerkleRootUpdated { new_root });
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
    }

    // ── aToken ERC20 interface ─────────────────────────────────────────────────

    #[abi(embed_v0)]
    impl AionVaultERC20Impl of IERC20<ContractState> {
        fn name(self: @ContractState) -> ByteArray { "Aion Token" }
        fn symbol(self: @ContractState) -> ByteArray { "aionToken" }
        fn decimals(self: @ContractState) -> u8 { 8 }
        fn total_supply(self: @ContractState) -> u256 { self.total_shares.read() }
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.shares.read(account)
        }
        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress
        ) -> u256 {
            self.allowances.read((owner, spender))
        }
        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            let bal = self.shares.read(caller);
            assert(bal >= amount, 'aionToken: low balance');
            self.shares.write(caller, bal - amount);
            self.shares.write(recipient, self.shares.read(recipient) + amount);
            self.emit(Transfer { from: caller, to: recipient, value: amount });
            true
        }
        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let caller = get_caller_address();
            let allowed = self.allowances.read((sender, caller));
            assert(allowed >= amount, 'aionToken: low allowance');
            self.allowances.write((sender, caller), allowed - amount);
            let bal = self.shares.read(sender);
            assert(bal >= amount, 'aionToken: low balance');
            self.shares.write(sender, bal - amount);
            self.shares.write(recipient, self.shares.read(recipient) + amount);
            self.emit(Transfer { from: sender, to: recipient, value: amount });
            true
        }
        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            self.allowances.write((caller, spender), amount);
            self.emit(Approval { owner: caller, spender, value: amount });
            true
        }
        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            self.assert_owner();
            self._mint(recipient, amount);
        }
        fn burn(ref self: ContractState, account: ContractAddress, amount: u256) {
            self.assert_owner();
            self._burn(account, amount);
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_owner(self: @ContractState) {
            assert(get_caller_address() == self.owner.read(), 'Not owner');
        }

        fn assert_not_paused(self: @ContractState) {
            assert(!self.is_paused.read(), 'Vault is paused');
        }

        fn tier_to_amount(self: @ContractState, tier: u8) -> u256 {
            if tier == 0 { DENOM_0 }
            else if tier == 1 { DENOM_1 }
            else if tier == 2 { DENOM_2 }
            else if tier == 3 { DENOM_3 }
            else { panic!("Invalid tier") }
        }

        fn _mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            self.shares.write(recipient, self.shares.read(recipient) + amount);
            self.total_shares.write(self.total_shares.read() + amount);
            self.emit(Transfer {
                from: starknet::contract_address_const::<0>(),
                to: recipient,
                value: amount,
            });
        }

        fn _burn(ref self: ContractState, account: ContractAddress, amount: u256) {
            self.shares.write(account, self.shares.read(account) - amount);
            self.total_shares.write(self.total_shares.read() - amount);
            self.emit(Transfer {
                from: account,
                to: starknet::contract_address_const::<0>(),
                value: amount,
            });
        }
    }
}
