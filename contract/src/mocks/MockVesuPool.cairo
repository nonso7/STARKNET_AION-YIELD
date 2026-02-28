/// Mock Vesu vToken pool for testing VesuAdapter
#[starknet::contract]
pub mod MockVesuPool {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        Map, StorageMapReadAccess, StorageMapWriteAccess
    };

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        total: u256,
        exchange_rate: u256,  // assets per share, scaled 1e18
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.exchange_rate.write(1_000_000_000_000_000_000_u256); // 1:1
    }

    #[abi(embed_v0)]
    impl MockVesuPoolImpl of stark_hackathon::VesuAdapter::IVToken<ContractState> {
        fn deposit(ref self: ContractState, assets: u256, receiver: ContractAddress) -> u256 {
            let shares = self.convert_to_shares(assets);
            let prev = self.balances.read(receiver);
            self.balances.write(receiver, prev + shares);
            self.total.write(self.total.read() + assets);
            shares
        }

        fn redeem(
            ref self: ContractState,
            shares: u256,
            receiver: ContractAddress,
            owner: ContractAddress
        ) -> u256 {
            let assets = self.convert_to_assets(shares);
            let prev = self.balances.read(owner);
            let to_burn = if shares > prev { prev } else { shares };
            self.balances.write(owner, prev - to_burn);
            let t = self.total.read();
            self.total.write(if assets > t { 0 } else { t - assets });
            assets
        }

        fn convert_to_assets(self: @ContractState, shares: u256) -> u256 {
            shares
        }

        fn convert_to_shares(self: @ContractState, assets: u256) -> u256 {
            assets
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }

        fn total_assets(self: @ContractState) -> u256 {
            self.total.read()
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            true
        }
    }
}
