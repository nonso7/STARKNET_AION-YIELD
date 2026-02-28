/// Mock WBTC token for testing
#[starknet::contract]
pub mod MockWBTC {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        Map, StorageMapReadAccess, StorageMapWriteAccess
    };

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
        total_supply: u256,
        owner: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Transfer: Transfer,
        Approval: Approval,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Transfer { pub from: ContractAddress, pub to: ContractAddress, pub value: u256 }
    #[derive(Drop, starknet::Event)]
    pub struct Approval { pub owner: ContractAddress, pub spender: ContractAddress, pub value: u256 }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
    }

    #[abi(embed_v0)]
    impl MockWBTCImpl of stark_hackathon::interfaces::IERC20::IERC20<ContractState> {
        fn name(self: @ContractState) -> ByteArray { "Wrapped Bitcoin" }
        fn symbol(self: @ContractState) -> ByteArray { "WBTC" }
        fn decimals(self: @ContractState) -> u8 { 8 }
        fn total_supply(self: @ContractState) -> u256 { self.total_supply.read() }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }

        fn allowance(self: @ContractState, owner: ContractAddress, spender: ContractAddress) -> u256 {
            self.allowances.read((owner, spender))
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            let bal = self.balances.read(caller);
            assert(bal >= amount, 'Insufficient balance');
            self.balances.write(caller, bal - amount);
            let recv_bal = self.balances.read(recipient);
            self.balances.write(recipient, recv_bal + amount);
            self.emit(Transfer { from: caller, to: recipient, value: amount });
            true
        }

        fn transfer_from(ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            let allowance = self.allowances.read((sender, caller));
            assert(allowance >= amount, 'Insufficient allowance');
            self.allowances.write((sender, caller), allowance - amount);
            let bal = self.balances.read(sender);
            assert(bal >= amount, 'Insufficient balance');
            self.balances.write(sender, bal - amount);
            let recv_bal = self.balances.read(recipient);
            self.balances.write(recipient, recv_bal + amount);
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
            let bal = self.balances.read(recipient);
            self.balances.write(recipient, bal + amount);
            self.total_supply.write(self.total_supply.read() + amount);
            self.emit(Transfer {
                from: starknet::contract_address_const::<0>(),
                to: recipient,
                value: amount,
            });
        }

        fn burn(ref self: ContractState, account: ContractAddress, amount: u256) {
            let bal = self.balances.read(account);
            assert(bal >= amount, 'Insufficient balance');
            self.balances.write(account, bal - amount);
            self.total_supply.write(self.total_supply.read() - amount);
        }
    }
}
