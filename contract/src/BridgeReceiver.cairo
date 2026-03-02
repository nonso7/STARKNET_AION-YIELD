/// AION Yield — BridgeReceiver
/// Handles incoming WBTC from Garden Finance or Atomiq bridge.
/// On completion: auto-routes to vault (public or private deposit).
/// Based on BitYield's AtomiqBridge.cairo, generalized to support any bridge.

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
    pub btc_amount: u256,
    pub commitment: felt252,   // 0 = public deposit, nonzero = private
    pub status: BridgeStatus,
    pub auto_deposit: bool,
    pub timestamp: u64,
}

#[starknet::interface]
pub trait IBridgeReceiver<TContractState> {
    fn initiate_bridge(
        ref self: TContractState,
        btc_amount: u256,
        commitment: felt252,
        auto_deposit: bool,
    ) -> felt252;
    fn complete_bridge(ref self: TContractState, request_id: felt252, wbtc_amount: u256);
    fn fail_bridge(ref self: TContractState, request_id: felt252);
    fn get_request(self: @TContractState, request_id: felt252) -> BridgeRequest;
    fn update_bridge_gateway(ref self: TContractState, new_gateway: ContractAddress);
    fn update_vault(ref self: TContractState, new_vault: ContractAddress);
    fn set_relayer(ref self: TContractState, relayer: ContractAddress);
}

#[starknet::contract]
pub mod BridgeReceiver {
    use super::{IBridgeReceiver, BridgeRequest, BridgeStatus};
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_block_timestamp};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        Map, StorageMapReadAccess, StorageMapWriteAccess
    };
    use core::poseidon::poseidon_hash_span;
    use stark_hackathon::interfaces::IERC20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use stark_hackathon::AionVault::{IAionVaultDispatcher, IAionVaultDispatcherTrait};

    // Garden Finance / Atomiq bridge fee: 10 bps = 0.1%
    const BRIDGE_FEE_BPS: u256 = 10;
    const BPS_DENOMINATOR: u256 = 10000;

    // Min/max bridge amounts (in satoshis, 8 decimals)
    const MIN_BRIDGE_AMOUNT: u256 = 100000;     // 0.001 BTC
    const MAX_BRIDGE_AMOUNT: u256 = 1000000000; // 10 BTC

    #[storage]
    struct Storage {
        owner: ContractAddress,
        vault: ContractAddress,
        wbtc_token: ContractAddress,
        bridge_gateway: ContractAddress,
        relayer: ContractAddress,
        requests: Map<felt252, BridgeRequest>,
        request_nonce: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        BridgeInitiated: BridgeInitiated,
        BridgeCompleted: BridgeCompleted,
        BridgeFailed: BridgeFailed,
        AutoDepositExecuted: AutoDepositExecuted,
    }

    #[derive(Drop, starknet::Event)]
    pub struct BridgeInitiated {
        pub request_id: felt252,
        pub sender: ContractAddress,
        pub btc_amount: u256,
        pub is_private: bool,
    }
    #[derive(Drop, starknet::Event)]
    pub struct BridgeCompleted {
        pub request_id: felt252,
        pub wbtc_amount: u256,
    }
    #[derive(Drop, starknet::Event)]
    pub struct BridgeFailed { pub request_id: felt252 }
    #[derive(Drop, starknet::Event)]
    pub struct AutoDepositExecuted {
        pub request_id: felt252,
        pub is_private: bool,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        vault: ContractAddress,
        wbtc_token: ContractAddress,
        bridge_gateway: ContractAddress,
    ) {
        self.owner.write(owner);
        self.vault.write(vault);
        self.wbtc_token.write(wbtc_token);
        self.bridge_gateway.write(bridge_gateway);
        self.relayer.write(owner);
        self.request_nonce.write(0);
    }

    #[abi(embed_v0)]
    impl BridgeReceiverImpl of IBridgeReceiver<ContractState> {

        /// User calls this to initiate a BTC bridge.
        /// For private deposits: provide commitment = poseidon(secret, nullifier)
        /// For public deposits: commitment = 0
        fn initiate_bridge(
            ref self: ContractState,
            btc_amount: u256,
            commitment: felt252,
            auto_deposit: bool,
        ) -> felt252 {
            assert(btc_amount >= MIN_BRIDGE_AMOUNT, 'Below min bridge amount');
            assert(btc_amount <= MAX_BRIDGE_AMOUNT, 'Exceeds max bridge amount');

            let caller = get_caller_address();
            let nonce = self.request_nonce.read();
            self.request_nonce.write(nonce + 1);

            // Generate deterministic request_id
            let request_id = poseidon_hash_span(
                array![caller.into(), btc_amount.low.into(), nonce.into()].span()
            );

            self.requests.write(request_id, BridgeRequest {
                sender: caller,
                btc_amount,
                commitment,
                status: BridgeStatus::Pending,
                auto_deposit,
                timestamp: get_block_timestamp(),
            });

            self.emit(BridgeInitiated {
                request_id,
                sender: caller,
                btc_amount,
                is_private: commitment != 0,
            });

            request_id
        }

        /// Called by relayer when bridge has completed and WBTC is sent here.
        fn complete_bridge(ref self: ContractState, request_id: felt252, wbtc_amount: u256) {
            self.assert_relayer();
            let mut req = self.requests.read(request_id);
            assert(req.status == BridgeStatus::Pending, 'Request not pending');

            req.status = BridgeStatus::Completed;
            self.requests.write(request_id, req);

            self.emit(BridgeCompleted { request_id, wbtc_amount });

            // Auto-deposit into vault
            if req.auto_deposit && wbtc_amount > 0 {
                let mut vault = IAionVaultDispatcher { contract_address: self.vault.read() };
                let mut wbtc = IERC20Dispatcher { contract_address: self.wbtc_token.read() };
                wbtc.approve(self.vault.read(), wbtc_amount);

                if req.commitment == 0 {
                    // Public deposit
                    vault.deposit(wbtc_amount);
                } else {
                    // Private deposit — commitment was set at initiation
                    vault.deposit_private(req.commitment, 0_u8);
                }

                self.emit(AutoDepositExecuted {
                    request_id,
                    is_private: req.commitment != 0,
                });
            }
        }

        fn fail_bridge(ref self: ContractState, request_id: felt252) {
            self.assert_relayer();
            let mut req = self.requests.read(request_id);
            assert(req.status == BridgeStatus::Pending, 'Request not pending');
            req.status = BridgeStatus::Failed;
            self.requests.write(request_id, req);
            self.emit(BridgeFailed { request_id });
        }

        fn get_request(self: @ContractState, request_id: felt252) -> BridgeRequest {
            self.requests.read(request_id)
        }

        fn update_bridge_gateway(ref self: ContractState, new_gateway: ContractAddress) {
            self.assert_owner();
            self.bridge_gateway.write(new_gateway);
        }

        fn update_vault(ref self: ContractState, new_vault: ContractAddress) {
            self.assert_owner();
            self.vault.write(new_vault);
        }

        fn set_relayer(ref self: ContractState, relayer: ContractAddress) {
            self.assert_owner();
            self.relayer.write(relayer);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_owner(self: @ContractState) {
            assert(get_caller_address() == self.owner.read(), 'Not owner');
        }

        fn assert_relayer(self: @ContractState) {
            let caller = get_caller_address();
            assert(
                caller == self.relayer.read() || caller == self.owner.read(),
                'Not relayer'
            );
        }
    }
}
