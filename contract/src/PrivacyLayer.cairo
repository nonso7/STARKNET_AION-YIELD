/// AION Yield — PrivacyLayer (ZK Edition)
///
/// Upgraded from a simple Poseidon Merkle proof checker to a full
/// ZK-proof verifier using the Garaga UltraKeccakHonk backend.
///
/// Privacy model
/// ─────────────
/// DEPOSIT:
///   1. User generates (secret, nullifier) off-chain.
///   2. Computes: commitment = Poseidon2(secret, nullifier, denomination_tier)
///   3. Calls AionVault.deposit_private(commitment, denomination_tier).
///      → Calldata reveals: commitment hash + tier (0/1/2/3), NOT the amount.
///
/// WITHDRAWAL:
///   1. User generates a Noir ZK proof off-chain (circuit/src/main.nr).
///      Public inputs: root, nullifier_hash, recipient, denomination_tier
///   2. Calls AionVault.withdraw_private(zk_proof, nullifier_hash, recipient, tier).
///      → Calldata reveals: proof bytes + nullifier hash (opaque) + recipient.
///      → secret and nullifier are NEVER in calldata.
///
/// Double-spend prevention
/// ───────────────────────
/// nullifier_hash = Poseidon2(nullifier) is marked spent after first withdrawal.
/// Re-using the same note produces the same nullifier_hash → rejected.
///
/// ZK Verifier
/// ───────────
/// Uses Garaga's deployed UltraKeccakHonk verifier contract on Starknet.
/// Address is set by the owner after deployment (configurable per network).
/// https://github.com/keep-starknet-strange/garaga

use starknet::ContractAddress;
use core::poseidon::poseidon_hash_span;

/// Denomination tier → WBTC satoshi amount
/// Tier 0: 0.001 WBTC = 100_000
/// Tier 1: 0.01  WBTC = 1_000_000
/// Tier 2: 0.1   WBTC = 10_000_000
/// Tier 3: 1.0   WBTC = 100_000_000
fn denomination_amount(tier: u8) -> u256 {
    if tier == 0 { 100_000_u256 }
    else if tier == 1 { 1_000_000_u256 }
    else if tier == 2 { 10_000_000_u256 }
    else if tier == 3 { 100_000_000_u256 }
    else { panic!("Invalid denomination tier") }
}

#[starknet::interface]
pub trait IPrivacyLayer<TContractState> {
    fn register_commitment(ref self: TContractState, commitment: felt252);
    fn verify_zk_and_nullify(
        ref self: TContractState,
        zk_proof: Span<felt252>,
        nullifier_hash: felt252,
        recipient: ContractAddress,
        denomination_tier: u8,
    ) -> bool;
    fn update_root(ref self: TContractState, new_root: felt252);
    fn set_garaga_verifier(ref self: TContractState, verifier: ContractAddress);
    fn set_vault(ref self: TContractState, vault: ContractAddress);
    fn get_merkle_root(self: @TContractState) -> felt252;
    fn get_commitment_at(self: @TContractState, index: u32) -> felt252;
    fn is_nullifier_spent(self: @TContractState, nullifier_hash: felt252) -> bool;
    fn get_total_commitments(self: @TContractState) -> u32;
    fn get_garaga_verifier(self: @TContractState) -> ContractAddress;
    fn get_denomination_amount(self: @TContractState, tier: u8) -> u256;
}

/// Garaga UltraKeccakHonk verifier dispatch interface.
/// We call the deployed Garaga contract via this interface.
#[starknet::interface]
trait IGaragaVerifier<TContractState> {
    fn verify_ultra_keccak_honk_proof(
        self: @TContractState,
        full_proof_with_hints: Span<felt252>,
    ) -> Option<Span<u256>>;
}

#[starknet::contract]
pub mod PrivacyLayer {
    use super::{IPrivacyLayer, IGaragaVerifierDispatcher, IGaragaVerifierDispatcherTrait};
    use super::denomination_amount;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        Map, StorageMapReadAccess, StorageMapWriteAccess
    };
    use core::num::traits::Zero;

    #[storage]
    struct Storage {
        vault: ContractAddress,
        owner: ContractAddress,
        merkle_root: felt252,
        garaga_verifier: ContractAddress,
        commitments: Map<u32, felt252>,
        total_commitments: u32,
        nullifiers: Map<felt252, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        CommitmentRegistered: CommitmentRegistered,
        NullifierSpent: NullifierSpent,
        RootUpdated: RootUpdated,
        GaragaVerifierSet: GaragaVerifierSet,
    }

    #[derive(Drop, starknet::Event)]
    pub struct CommitmentRegistered {
        pub commitment: felt252,
        pub index: u32,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct NullifierSpent {
        pub nullifier_hash: felt252,
        pub timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RootUpdated {
        pub old_root: felt252,
        pub new_root: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct GaragaVerifierSet {
        pub verifier: ContractAddress,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        vault: ContractAddress,
        initial_root: felt252,
    ) {
        self.owner.write(owner);
        self.vault.write(vault);
        self.merkle_root.write(initial_root);
        self.total_commitments.write(0);
    }

    #[abi(embed_v0)]
    impl PrivacyLayerImpl of IPrivacyLayer<ContractState> {

        // ─────────────────────────────────────────────────────────────────
        // DEPOSIT SIDE — register commitment on-chain
        // ─────────────────────────────────────────────────────────────────

        fn register_commitment(ref self: ContractState, commitment: felt252) {
            let caller = get_caller_address();
            assert(caller == self.vault.read(), 'Only vault can register');
            assert(commitment != 0, 'Empty commitment');

            let index = self.total_commitments.read();
            self.commitments.write(index, commitment);
            self.total_commitments.write(index + 1);

            self.emit(CommitmentRegistered {
                commitment,
                index,
                timestamp: get_block_timestamp(),
            });
        }

        // ─────────────────────────────────────────────────────────────────
        // WITHDRAWAL SIDE — ZK proof verification via Garaga
        // ─────────────────────────────────────────────────────────────────

        /// Verify a Noir UltraKeccakHonk proof and mark the nullifier spent.
        ///
        /// The Garaga verifier extracts the public inputs from the proof:
        ///   [0] root              — must match self.merkle_root
        ///   [1] nullifier_hash    — must match the argument
        ///   [2] recipient         — must match the argument (as felt252)
        ///   [3] denomination_tier — must match the argument
        ///
        /// Panics if:
        ///   - Caller is not the vault
        ///   - Garaga verifier is not configured
        ///   - ZK proof is invalid
        ///   - Public inputs mismatch stored state
        ///   - Nullifier has already been spent
        fn verify_zk_and_nullify(
            ref self: ContractState,
            zk_proof: Span<felt252>,
            nullifier_hash: felt252,
            recipient: ContractAddress,
            denomination_tier: u8,
        ) -> bool {
            let caller = get_caller_address();
            assert(caller == self.vault.read(), 'Only vault can nullify');

            // Double-spend check before calling verifier (cheap early exit)
            assert(!self.nullifiers.read(nullifier_hash), 'Nullifier already spent');

            let verifier_addr = self.garaga_verifier.read();
            assert(verifier_addr.is_non_zero(), 'Garaga verifier not set');

            // ── Call Garaga on-chain verifier ───────────────────────────────
            let verifier = IGaragaVerifierDispatcher { contract_address: verifier_addr };
            let result = verifier.verify_ultra_keccak_honk_proof(zk_proof);

            // ── Extract and validate public inputs ──────────────────────────
            match result {
                Option::Some(public_inputs) => {
                    assert(public_inputs.len() >= 4, 'Bad public inputs length');

                    // [0] root — must match the stored Merkle root
                    let proof_root: felt252 = (*public_inputs.at(0))
                        .try_into()
                        .expect('Root: u256 overflow');
                    assert(proof_root == self.merkle_root.read(), 'Proof root mismatch');

                    // [1] nullifier_hash — must match the submitted nullifier_hash
                    let proof_nh: felt252 = (*public_inputs.at(1))
                        .try_into()
                        .expect('NH: u256 overflow');
                    assert(proof_nh == nullifier_hash, 'Nullifier hash mismatch');

                    // [2] recipient — must match the submitted recipient address
                    let proof_recipient: felt252 = (*public_inputs.at(2))
                        .try_into()
                        .expect('Recipient: u256 overflow');
                    let expected_recipient: felt252 = recipient.into();
                    assert(proof_recipient == expected_recipient, 'Recipient mismatch');

                    // [3] denomination_tier — must match the submitted tier
                    let proof_tier: u256 = *public_inputs.at(3);
                    assert(proof_tier == denomination_tier.into(), 'Denomination tier mismatch');
                },
                Option::None => {
                    assert(false, 'ZK proof invalid')
                },
            }

            // ── Mark nullifier as spent ─────────────────────────────────────
            self.nullifiers.write(nullifier_hash, true);

            self.emit(NullifierSpent {
                nullifier_hash,
                timestamp: get_block_timestamp(),
            });

            true
        }

        // ─────────────────────────────────────────────────────────────────
        // ADMIN
        // ─────────────────────────────────────────────────────────────────

        fn update_root(ref self: ContractState, new_root: felt252) {
            let caller = get_caller_address();
            assert(
                caller == self.owner.read() || caller == self.vault.read(),
                'Unauthorized'
            );
            let old_root = self.merkle_root.read();
            self.merkle_root.write(new_root);
            self.emit(RootUpdated { old_root, new_root });
        }

        fn set_garaga_verifier(ref self: ContractState, verifier: ContractAddress) {
            assert(get_caller_address() == self.owner.read(), 'Only owner');
            self.garaga_verifier.write(verifier);
            self.emit(GaragaVerifierSet { verifier });
        }

        fn set_vault(ref self: ContractState, vault: ContractAddress) {
            assert(get_caller_address() == self.owner.read(), 'Only owner');
            self.vault.write(vault);
        }

        // ─────────────────────────────────────────────────────────────────
        // VIEW
        // ─────────────────────────────────────────────────────────────────

        fn get_merkle_root(self: @ContractState) -> felt252 {
            self.merkle_root.read()
        }

        fn get_commitment_at(self: @ContractState, index: u32) -> felt252 {
            self.commitments.read(index)
        }

        fn is_nullifier_spent(self: @ContractState, nullifier_hash: felt252) -> bool {
            self.nullifiers.read(nullifier_hash)
        }

        fn get_total_commitments(self: @ContractState) -> u32 {
            self.total_commitments.read()
        }

        fn get_garaga_verifier(self: @ContractState) -> ContractAddress {
            self.garaga_verifier.read()
        }

        fn get_denomination_amount(self: @ContractState, tier: u8) -> u256 {
            denomination_amount(tier)
        }
    }
}
