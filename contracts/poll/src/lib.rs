#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, symbol_short, Address, Env, Symbol, Vec};

const COUNTS: Symbol = symbol_short!("COUNTS");
const QUESTION: Symbol = symbol_short!("QUESTION");

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInit = 1,
    NotInit = 2,
    BadOption = 3,
}

#[contract]
pub struct Poll;

#[contractimpl]
impl Poll {
    /// One-time setup: fix the question and number of options. Counts start at 0.
    pub fn init(env: Env, question: Symbol, num_options: u32) -> Result<(), Error> {
        if env.storage().instance().has(&COUNTS) {
            return Err(Error::AlreadyInit);
        }
        let mut counts: Vec<u32> = Vec::new(&env);
        for _ in 0..num_options {
            counts.push_back(0);
        }
        env.storage().instance().set(&COUNTS, &counts);
        env.storage().instance().set(&QUESTION, &question);
        Ok(())
    }

    /// Cast a vote for `option`. Voter must authorize. Emits a `vote` event.
    pub fn vote(env: Env, voter: Address, option: u32) -> Result<(), Error> {
        voter.require_auth();
        let mut counts: Vec<u32> = env
            .storage()
            .instance()
            .get(&COUNTS)
            .ok_or(Error::NotInit)?;
        if option >= counts.len() {
            return Err(Error::BadOption);
        }
        let current = counts.get(option).unwrap_or(0);
        counts.set(option, current + 1);
        env.storage().instance().set(&COUNTS, &counts);
        env.events()
            .publish((symbol_short!("vote"), voter), option);
        Ok(())
    }

    /// Live tally, index = option.
    pub fn get_results(env: Env) -> Result<Vec<u32>, Error> {
        env.storage()
            .instance()
            .get(&COUNTS)
            .ok_or(Error::NotInit)
    }

    pub fn get_question(env: Env) -> Result<Symbol, Error> {
        env.storage()
            .instance()
            .get(&QUESTION)
            .ok_or(Error::NotInit)
    }
}

mod test;
