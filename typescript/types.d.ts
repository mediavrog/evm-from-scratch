export interface TransactionData {
  address: bigint,
  caller: bigint,
  origin: bigint,
  gasPrice: bigint,
  value: bigint,
  data: Uint8Array,
}

export interface BlockData {
  baseFee: bigint,
  coinbase: bigint,
  timestamp: bigint,
  number: bigint,
  difficulty: bigint,
  gasLimit: bigint,
  chainId: bigint,
}

export interface StateData {
  [key: string] : {
    balance: string,
    nonce: string,
    code: {[key: string]: string},
    storage: {[key: string]: string}
  }
}
