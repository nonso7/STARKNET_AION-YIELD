/// Mock Ekubo core for testing EkuboAdapter
#[starknet::contract]
pub mod MockEkuboPool {
    use starknet::{ContractAddress, get_block_timestamp};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        liquidity: u256,
        fees_pending: u256,
    }

    #[abi(embed_v0)]
    impl MockEkuboPoolImpl of stark_hackathon::EkuboAdapter::IEkuboCore<ContractState> {
        fn mint_and_deposit(
            ref self: ContractState,
            pool_key: felt252,
            tick_lower: i128,
            tick_upper: i128,
            min_token0: u128,
            min_token1: u128,
            max_token0: u128,
            max_token1: u128,
            deadline: u64,
        ) -> (u128, u256, u256) {
            let liq: u128 = max_token0;
            self.liquidity.write(self.liquidity.read() + liq.into());
            (liq, liq.into(), 0)
        }

        fn collect_fees(ref self: ContractState, id: u64) -> (u256, u256) {
            let fees = self.fees_pending.read();
            self.fees_pending.write(0);
            (fees, 0)
        }

        fn withdraw(
            ref self: ContractState,
            id: u64,
            min_token0: u128,
            min_token1: u128,
            deadline: u64,
        ) -> (u256, u256) {
            let liq = self.liquidity.read();
            self.liquidity.write(0);
            (liq, 0)
        }
    }
}
