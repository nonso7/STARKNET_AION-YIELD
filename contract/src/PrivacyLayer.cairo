/// AION Yield — PrivacyLayer
/// Commitment-scheme based privacy using Poseidon hashes + Merkle proofs.
/// Inspired by Stark Cloak mixer but adapted for yield vault use.
/// Users commit (secret, nullifier) off-chain; on-chain only the hash is stored.

use starknet::ContractAddress;
use core::poseidon::poseidon_hash_span;

/// Verify a Poseidon Merkle proof. Sorted-pair hashing matches OZ standard.
fn verify_poseidon(root: felt252, leaf: felt252, proof: Span<felt252>) -> bool {
    let mut current = leaf;
    let mut i: u32 = 0;
    loop {
        if i >= proof.len() { break; }
        let sibling = *proof[i];
        let current_u256: u256 = current.into();
        let sibling_u256: u256 = sibling.into();
        current = if current_u256 < sibling_u256 {
            poseidon_hash_span(array![current, sibling].span())
        } else {
            poseidon_hash_span(array![sibling, current].span())
        };
        i += 1;
    };
    current == root
}

#[starknet::interface]
pub trait IPrivacyLayer<TContractState> {
    fn register_commitment(ref self: TContractState, commitment: felt252);
    fn verify_and_nullify(
        ref self: TContractState,
        merkle_proof: Span<felt252>,
        secret: felt252,
        nullifier: felt252,
        amount: u256
    ) -> bool;
    fn update_root(ref self: TContractState, new_root: felt252);
    fn get_merkle_root(self: @TContractState) -> felt252;
    fn get_commitment_at(self: @TContractState, index: u32) -> felt252;
    fn is_nullifier_spent(self: @TContractState, nullifier_hash: felt252) -> bool;
    fn get_total_commitments(self: @TContractState) -> u32;
    fn set_vault(ref self: TContractState, vault: ContractAddress);
}

#[starknet::contract]
pub mod PrivacyLayer {
    use super::IPrivacyLayer;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        Map, StorageMapReadAccess, StorageMapWriteAccess
    };
    use core::poseidon::poseidon_hash_span;
    use super::verify_poseidon;

    #[storage]
    struct Storage {
        vault: ContractAddress,
        owner: ContractAddress,
        merkle_root: felt252,
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

        /// Called by AionVault on private deposit.
        /// Stores commitment hash on-chain — amount is hidden.
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

        /// Called by AionVault on private withdrawal.
        /// Verifies Merkle proof + computes commitment from (secret, nullifier).
        /// Marks nullifier spent to prevent double-withdrawals.
        fn verify_and_nullify(
            ref self: ContractState,
            merkle_proof: Span<felt252>,
            secret: felt252,
            nullifier: felt252,
            amount: u256
        ) -> bool {
            let caller = get_caller_address();
            assert(caller == self.vault.read(), 'Only vault can nullify');

            // Derive commitment = poseidon(secret, nullifier)
            let commitment = poseidon_hash_span(array![secret, nullifier].span());

            // Derive nullifier hash to prevent double-spend
            let nullifier_hash = poseidon_hash_span(array![nullifier].span());
            assert(!self.nullifiers.read(nullifier_hash), 'Nullifier already spent');

            // Verify commitment exists in Merkle tree
            let root = self.merkle_root.read();
            let leaf = commitment;
            let is_valid = verify_poseidon(root, leaf, merkle_proof);
            assert(is_valid, 'Invalid Merkle proof');

            // Mark nullifier spent
            self.nullifiers.write(nullifier_hash, true);

            self.emit(NullifierSpent {
                nullifier_hash,
                timestamp: get_block_timestamp(),
            });

            true
        }

        /// Owner updates Merkle root after new commitments are added off-chain.
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

        fn set_vault(ref self: ContractState, vault: ContractAddress) {
            assert(get_caller_address() == self.owner.read(), 'Only owner');
            self.vault.write(vault);
        }
    }
}
