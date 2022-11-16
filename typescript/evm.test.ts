import { expect, test } from "@jest/globals";
import evm from "./evm";
import tests from "../evm.json";
import {TransactionData, BlockData, StateData, OpResult} from "./types";

for (const t of tests as any) {
  test(t.name, () => {
    // Note: as the test cases get more complex, you'll need to modify this
    // to pass down more arguments to the evm function (e.g. block, state, etc.)
    // and return more data (e.g. state, logs, etc.)
    const tx = {
      address: BigInt(t.tx?.to || 0),
      caller: BigInt(t.tx?.from || 0),
      origin: BigInt(t.tx?.origin || 0),
      gasPrice: BigInt(t.tx?.gasprice || 0),
      value: BigInt(t.tx?.value || 0),
      data: hexStringToUint8Array(t.tx?.data || ""),
    } as TransactionData;
    const block = {
      coinbase: BigInt(t.block?.coinbase || 0),
      baseFee: BigInt(t.block?.basefee || 0),
      timestamp: BigInt(t.block?.timestamp || 0),
      number: BigInt(t.block?.number || 0),
      difficulty: BigInt(t.block?.difficulty || 0),
      gasLimit: BigInt(t.block?.gaslimit || 0),
      chainId: BigInt(t.block?.chainid || 0),
    } as BlockData;
    const state = (t.state || {}) as StateData;
    const result = evm(hexStringToUint8Array(t.code.bin), tx, block, state) as OpResult;

    expect(result.success).toEqual(t.expect.success);
    t.expect.stack && expect(result.stack).toEqual(t.expect.stack.map((item) => BigInt(item)));
    t.expect.return && expect(result.return).toEqual(BigInt(`0x${t.expect.return}`));
    t.expect.logs && expect(result.logs).toEqual(t.expect.logs.map((log) => ({
      address: BigInt(log.address),
      data: BigInt(`0x${log.data}`),
      topics: log.topics.map((item) => BigInt(item))
    })));
  });
}

function hexStringToUint8Array(hexString: string) {
  return new Uint8Array(
    (hexString?.match(/../g) || []).map((byte) => parseInt(byte, 16))
  );
}
