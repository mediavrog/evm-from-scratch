import {ethers} from "ethers";
import {BlockData, LogEntry, OpResult, StateData, TransactionData} from "./types";
/**
 * EVM From Scratch
 * TypeScript template
 *
 * To work on EVM From Scratch in TypeScript:
 *
 * - Install Node.js: https://nodejs.org/en/download/
 * - Go to the `typescript` directory: `cd typescript`
 * - Install dependencies: `yarn` (or `npm install`)
 * - Edit `evm.ts` (this file!), see TODO below
 * - Run `yarn test` (or `npm test`) to run the tests
 * - Use Jest Watch Mode to run tests when files change: `yarn test --watchAll`
 */

const DEBUG = true;

const OPCODES = {
  STOP: 0x00,
  ADD: 0x01,
  MUL: 0x02,
  SUB: 0x03,
  DIV: 0x04,
  SDIV: 0x05,
  MOD: 0x06,
  SMOD: 0x07,
  ADDMOD: 0x08,
  MULMOD: 0x09,
  EXP: 0x0a,
  SIGNEXTEND: 0x0b,
  LT: 0x10,
  GT: 0x11,
  SLT: 0x12,
  SGT: 0x13,
  EQ: 0x14,
  ISZERO: 0x15,
  AND: 0x16,
  OR: 0x17,
  XOR: 0x18,
  NOT: 0x19,
  BYTE: 0x1a,
  SHL: 0x1b,
  SHR: 0x1c,
  SAR: 0x1d,
  SHA3: 0x20,
  ADDRESS: 0x30,
  BALANCE: 0x31,
  ORIGIN: 0x32,
  CALLER: 0x33,
  CALLVALUE: 0x34,
  CALLDATALOAD: 0x35,
  CALLDATASIZE: 0x36,
  CALLDATACOPY: 0x37,
  CODESIZE: 0x38,
  CODECOPY: 0x39,
  GASPRICE: 0x3a,
  EXTCODESIZE: 0x3b,
  EXTCODECOPY: 0x3c,
  RETURNDATASIZE: 0x3d,
  RETURNDATACOPY: 0x3e,
  EXTCODEHASH: 0x3f,
  BLOCKHASH: 0x40,
  COINBASE: 0x41,
  TIMESTAMP: 0x42,
  NUMBER: 0x43,
  DIFFICULTY: 0x44,
  GASLIMIT: 0x45,
  CHAINID: 0x46,
  SELFBALANCE: 0x47,
  BASEFEE: 0x48,
  POP: 0x50,
  MLOAD: 0x51,
  MSTORE: 0x52,
  MSTORE8: 0x53,
  SLOAD: 0x54,
  SSTORE: 0x55,
  JUMP: 0x56,
  JUMPI: 0x57,
  PC: 0x58,
  MSIZE: 0x59,
  GAS: 0x5a,
  JUMPDEST: 0x5b,
  PUSH1: 0x60,
  PUSH2: 0x61,
  PUSH3: 0x62,
  PUSH4: 0x63,
  PUSH5: 0x64,
  PUSH6: 0x65,
  PUSH7: 0x66,
  PUSH8: 0x67,
  PUSH9: 0x68,
  PUSH10: 0x69,
  PUSH11: 0x6a,
  PUSH12: 0x6b,
  PUSH13: 0x6c,
  PUSH14: 0x6d,
  PUSH15: 0x6e,
  PUSH16: 0x6f,
  PUSH17: 0x70,
  PUSH18: 0x71,
  PUSH19: 0x72,
  PUSH20: 0x73,
  PUSH21: 0x74,
  PUSH22: 0x75,
  PUSH23: 0x76,
  PUSH24: 0x77,
  PUSH25: 0x78,
  PUSH26: 0x79,
  PUSH27: 0x7a,
  PUSH28: 0x7b,
  PUSH29: 0x7c,
  PUSH30: 0x7d,
  PUSH31: 0x7e,
  PUSH32: 0x7f,
  DUP1: 0x80,
  DUP2: 0x81,
  DUP3: 0x82,
  DUP4: 0x83,
  DUP5: 0x84,
  DUP6: 0x85,
  DUP7: 0x86,
  DUP8: 0x87,
  DUP9: 0x88,
  DUP10: 0x89,
  DUP11: 0x8a,
  DUP12: 0x8b,
  DUP13: 0x8c,
  DUP14: 0x8d,
  DUP15: 0x8e,
  DUP16: 0x8f,
  SWAP1: 0x90,
  SWAP2: 0x91,
  SWAP3: 0x92,
  SWAP4: 0x93,
  SWAP5: 0x94,
  SWAP6: 0x95,
  SWAP7: 0x96,
  SWAP8: 0x97,
  SWAP9: 0x98,
  SWAP10: 0x99,
  SWAP11: 0x9a,
  SWAP12: 0x9b,
  SWAP13: 0x9c,
  SWAP14: 0x9d,
  SWAP15: 0x9e,
  SWAP16: 0x9f,
  LOG0: 0xa0,
  LOG1: 0xa1,
  LOG2: 0xa2,
  LOG3: 0xa3,
  LOG4: 0xa4,
  CREATE: 0xf0,
  CALL: 0xf1,
  CALLCODE: 0xf2,
  RETURN: 0xf3,
  DELEGATECALL: 0xf4,
  CREATE2: 0xf5,
  STATICCALL: 0xfa,
  REVERT: 0xfd,
  INVALID: 0xfe,
  SELFDESTRUCT: 0xff,
};

const OPNAMES = Object.entries(OPCODES).reduce((agg, cur) => {
  agg[cur[1]] = cur[0];
  return agg
}, {});

class Memory {
  data: Uint8Array;
  msize: bigint;

  constructor(size: number = 1024 * 1024) {
    this.data = new Uint8Array(size);
    this.msize = 0n;
  }

  updateMsize(offset, readSize = 0) {
    const offsetMsize = Math.ceil((Number(offset) + readSize) / 32) * 32;
    if(offsetMsize > this.msize) this.msize = BigInt(offsetMsize);
  }

  store(offset, value, size = 32n) {
    for (let i = 0n; i < size; i++) {
      this.data[Number(offset + i)] = Number((value >> ((size - i - 1n) * 8n)) & 0xffn);
    }
    this.updateMsize(offset);
  }

  load(offset, length = 32n) {
    let value = 0n;
    for (let i = 0n; i < length; i++) {
      value = (value << 8n) | BigInt(this.data[Number(offset + i)]);
      console.log("value", i, numberToHexFormatted(value))
    }
    this.updateMsize(offset, Number(length));
    console.log("load", value)
    return value;
  }
}

class Storage {
  data: {[key: string]: bigint};

  constructor() {
    this.data = {}
  }

  store(key, value) {
    this.data[key] = value;
  }

  load(key): bigint {
    return this.data[key] || 0n;
  }
}

const UINT256_CEIL = 2n**256n;

function curry(f) { // curry(f) does the currying transform
  return function(a) {
    return function(...b) {
      return f(a, ...b);
    };
  };
}

function hexStringToUint8Array(hexString: string) {
  return new Uint8Array(
      (hexString?.match(/../g) || []).map((byte) => parseInt(byte, 16))
  );
}

const numberToHexFormatted = (num: bigint | number | undefined): string => {
  if (num === undefined) return "undefined"
  const isNegative = num < 0;
  const numAbs = isNegative ? BigInt(num) * -1n : num;
  return `${isNegative ? "-" : ''}0x${numAbs < 16 ? '0' : ''}${numAbs.toString(16)}`;
}

const debugOpcode = (opcode: number): string => {
  return `${OPNAMES[opcode]} (${numberToHexFormatted(opcode)})`;
}

const error = (opcode: number, currentStack: bigint[], returnValue: bigint | undefined = undefined): OpResult => {
  DEBUG && console.log(`Operation ${debugOpcode(opcode)} on invalid stack`, currentStack);
  return {success: false, stack: [], return: returnValue}
}

const toBigInt = (val: boolean): bigint => val ? 1n : 0n

const toSigned = (val: bigint): bigint => val < UINT256_CEIL / 2n ? val : (UINT256_CEIL - val) * -1n;

const toUnsigned = (val: bigint): bigint => {
  if (val >= UINT256_CEIL) {
    return val % UINT256_CEIL;
  }

  if (val < 0) {
    return UINT256_CEIL + (val % UINT256_CEIL);
  }

  return val;
}

const isPush = (opcode: number): boolean => opcode >= OPCODES.PUSH1 && opcode <= OPCODES.PUSH32;
const isDup = (opcode: number): boolean => opcode >= OPCODES.DUP1 && opcode <= OPCODES.DUP16;
const isSwap = (opcode: number): boolean => opcode >= OPCODES.SWAP1 && opcode <= OPCODES.SWAP16;
const isLog = (opcode: number): boolean => opcode >= OPCODES.LOG0 && opcode <= OPCODES.LOG4;
const isCreate = (opcode: number): boolean => opcode === OPCODES.CREATE || opcode === OPCODES.CREATE2;

const addFn = (op1:bigint, op2:bigint):bigint => op1 + op2;
const subFn = (op1:bigint, op2:bigint):bigint => op1 - op2;
const mulFn = (op1:bigint, op2:bigint):bigint => op1 * op2;
const divFn = (op1:bigint, op2:bigint):bigint => op2 == 0n ? 0n : op1 / op2;
const modFn = (val:bigint, mod:bigint):bigint => mod == 0n ? 0n : val % mod;
const expFn = (val:bigint, exp:bigint):bigint => val ** exp;
const sextFn = (byteNum:bigint, val:bigint):bigint => {
  const signBit = val >> ((byteNum + 1n) * 8n) - 1n;
  return signBit === 1n /* negative */ ? (UINT256_CEIL - 1n) | val : val;
}
const sdivFn = (op1:bigint, op2:bigint):bigint => divFn(toSigned(op1), toSigned(op2));
const smodFn = (val:bigint, mod:bigint):bigint => modFn(toSigned(val), toSigned(mod));
const ltFn = (op1:bigint, op2:bigint):bigint => toBigInt(op1 < op2);
const gtFn = (op1:bigint, op2:bigint):bigint => toBigInt(op1 > op2);
const sltFn = (op1:bigint, op2:bigint):bigint => ltFn(toSigned(op1), toSigned(op2));
const sgtFn = (op1:bigint, op2:bigint):bigint => gtFn(toSigned(op1), toSigned(op2));
const eqFn = (op1:bigint, op2:bigint):bigint => toBigInt(op1 == op2);
const andFn = (op1:bigint, op2:bigint):bigint => op1 & op2;
const orFn = (op1:bigint, op2:bigint):bigint => op1 | op2;
const xorFn = (op1:bigint, op2:bigint):bigint => op1 ^ op2;
const shlFn = (bitNum:bigint, val:bigint):bigint => {
  let mask = (UINT256_CEIL - 1n) >> bitNum;
  return (val & mask) << bitNum
};
const shrFn = (bitNum:bigint, val:bigint):bigint => val >> bitNum;
const sarFn = (bitNum:bigint, val:bigint):bigint => shrFn(bitNum, toSigned(val));
const byteFn = (byteNum:bigint, val:bigint):bigint => shrFn(256n - 8n /* 1 byte in bits */ - byteNum * 8n, val) & 0xFFn

const loadFromUint8ArrayFn = (data: Uint8Array, byteOffset: bigint | undefined, size: bigint = 32n): bigint => {
  const offset = byteOffset || 0n;
  let value = 0n;
  for (let i = 0n; i < size; i++) {
    value = (value << 8n) | BigInt(data[Number(offset + i)] || 0);
  }
  return value;
}

// persistent storage
const storage = new Storage();

export default function evm(
    code: Uint8Array,
    tx: TransactionData,
    block: BlockData,
    state: StateData,
    contextWritable: boolean = true
): OpResult {
  DEBUG && console.log("###", Array.from(code, (byte) => numberToHexFormatted(byte)), "###")
  let pc = 0;
  const stack:bigint[] = [];
  const logs:LogEntry[] = [];
  const mem = new Memory();
  let returnValue: bigint | undefined = undefined;
  let lastSubReturn: bigint | undefined = undefined;

  const exec2 = (opcode:number, ...operations: ((op1:bigint, op2:bigint) => bigint)[]): OpResult => {
    for (let i = 0; i < operations.length; i++) {
      const opFn = operations[i];
      const op1 = stack.shift();
      const op2 = stack.shift();
      DEBUG && console.log(`exec2 ${debugOpcode(opcode)} operands ${numberToHexFormatted(op1)} ${numberToHexFormatted(op2)}`)
      if (op1 !== undefined && op2 !== undefined) {
        let result = opFn(op1, op2);
        DEBUG && console.log(`result (raw) ${numberToHexFormatted(result)}`)

        // convert to unsigned uint256 during final iteration
        if (i === operations.length - 1) {
          result = toUnsigned(result);
          DEBUG && console.log(`result (unsigned) ${numberToHexFormatted(result)}`)
        }

        stack.unshift(result);
        DEBUG && console.log(`stack is now`, stack)
      } else {
        return error(opcode, stack)
      }
    }

    return { success: true, stack }
  }

  const peek = (): bigint | undefined => {
    const topEl = stack.length > 0 ? stack[0] : undefined;
    DEBUG && console.log("Peek Top", numberToHexFormatted(topEl));
    return topEl;
  }

  const validJumpDestinations = new Set();
  for (let i = 0; i < code.length;) {
    const opcode = code[i];
    if (opcode == OPCODES.JUMPDEST) validJumpDestinations.add(BigInt(i));
    i += isPush(opcode) ? 2 : 1;
  }
  DEBUG && console.log("Valid JUMP destinations", validJumpDestinations);

  const jump = (destination: BigInt | undefined): boolean => {
    DEBUG && console.log("Destination", destination, "valid?", validJumpDestinations.has(destination));
    if (validJumpDestinations.has(destination)) {
      pc = Number(destination);
      return true;
    } else {
      return false;
    }
  }

  while (pc < code.length) {
    const opcode = code[pc];
    const exec2op = curry(exec2)(opcode);
    DEBUG && console.log(`Op ${debugOpcode(opcode)}`)

    if (isPush(opcode)) { // PUSHX
      let argument = BigInt(code[++pc]);
      const endIdx = pc + opcode - OPCODES.PUSH1;
      while(pc < endIdx) {
        argument = (argument << 8n) | BigInt(code[++pc]);
      }
      DEBUG && console.log("Push", numberToHexFormatted(argument));
      stack.unshift(argument)
    } else if (isDup(opcode)) { // DUPX
      const index = opcode - OPCODES.DUP1;
      if (stack.length > index) {
        stack.unshift(stack[index]);
      } else {
        error(opcode, stack);
      }
    } else if (isSwap(opcode)) { // SWAPX
      const index = opcode - OPCODES.SWAP1 + 1;
      if (stack.length > index) {
        const tmp = stack[index];
        stack[index] = stack[0];
        stack[0] = tmp;
      } else {
        error(opcode, stack);
      }
    } else if (isCreate(opcode)) { // CREATEX
      if (!contextWritable) return error(opcode, stack)

      const value = stack.shift()!;
      const offset = stack.shift()!;
      const size = stack.shift()!;

      // TODO: proper address generation and handle deterministic generation with CREATE2
      const address = BigInt(0xFF);

      const code = mem.load(offset, size).toString(16);
      const codeSub = hexStringToUint8Array(code);

      const result = evm(
          codeSub,
          tx,
          block,
          {
            [numberToHexFormatted(address)]: {
              balance: value.toString(16),
              nonce: "0",
              code: {
                bin: code
              },
              storage: { }
            }
          }
      )

      if(result.success) {
        DEBUG && console.log("Create with code", code, result)
        state[numberToHexFormatted(address)] = {
          balance: value.toString(16),
          nonce: "0",
          code: {
            bin: result.return ? result.return.toString(16) : ""
          },
          storage: { }
        }

        stack.unshift(address);
      } else {
        stack.unshift(0n);
      }
    } else if(isLog(opcode)) {
      if (!contextWritable) return error(opcode, stack)

      const offset = stack.shift();
      const length = stack.shift();
      const value = mem.load(offset, length);
      const address = tx.address;
      const logEntry = {
        address,
        data: value,
        topics: []
      } as LogEntry

      const topicsAmount = opcode - OPCODES.LOG0;
      for(let i = 0; i < topicsAmount; i++) {
        logEntry.topics.push(stack.shift()!)
      }

      logs.push(logEntry)
    } else {
      switch (opcode) {
        case OPCODES.POP:
          const popped = stack.shift();
          DEBUG && console.log("Pop", numberToHexFormatted(popped));
          break;
        case OPCODES.STOP:
          pc = code.length;
          break;
        case OPCODES.ADD:
          return exec2op(addFn);
        case OPCODES.MUL:
          return exec2op(mulFn);
        case OPCODES.SUB:
          return exec2op(subFn);
        case OPCODES.DIV:
          return exec2op(divFn);
        case OPCODES.MOD:
          return exec2op(modFn);
        case OPCODES.ADDMOD:
          return exec2op(addFn, modFn);
        case OPCODES.MULMOD:
          return exec2op(mulFn, modFn);
        case OPCODES.EXP:
          return exec2op(expFn);
        case OPCODES.SIGNEXTEND:
          return exec2op(sextFn);
        case OPCODES.SDIV:
          return exec2op(sdivFn);
        case OPCODES.SMOD:
          return exec2op(smodFn);
        case OPCODES.LT:
          return exec2op(ltFn);
        case OPCODES.GT:
          return exec2op(gtFn);
        case OPCODES.SLT:
          return exec2op(sltFn);
        case OPCODES.SGT:
          return exec2op(sgtFn);
        case OPCODES.EQ:
          return exec2op(eqFn);
        case OPCODES.ISZERO:
          stack.unshift(stack.shift() == 0n ? 1n : 0n);
          peek();
          break;
        case OPCODES.NOT:
          stack.unshift(toUnsigned(~stack.shift()!))
          peek();
          break;
        case OPCODES.AND:
          return exec2op(andFn);
        case OPCODES.OR:
          return exec2op(orFn);
        case OPCODES.XOR:
          return exec2op(xorFn);
        case OPCODES.SHL:
          return exec2op(shlFn);
        case OPCODES.SHR:
          return exec2op(shrFn);
        case OPCODES.SAR:
          return exec2op(sarFn);
        case OPCODES.BYTE:
          return exec2op(byteFn);
        case OPCODES.INVALID:
          return error(opcode, stack);
        case OPCODES.PC:
          stack.unshift(BigInt(pc));
          peek();
          break;
        case OPCODES.GAS:
          stack.unshift(UINT256_CEIL - 1n);
          peek();
          break;
        case OPCODES.JUMP:
          if (!jump(stack.shift())) return error(opcode, stack);
          break;
        case OPCODES.JUMPI:
          const destination = stack.shift();
          const conditional = stack.shift();
          if (conditional !== 0n) {
            if (!jump(destination)) return error(opcode, stack);
          }
          // no error if JUMPI doesn't jump due to conditional
          break;
        case OPCODES.MSTORE:
          mem.store(stack.shift(), stack.shift());
          DEBUG && console.log("Memory", mem.data);
          break;
        case OPCODES.MSTORE8:
          mem.store(stack.shift(), stack.shift(), 1n);
          DEBUG && console.log("Memory", mem.data);
          break;
        case OPCODES.MLOAD:
          stack.unshift(mem.load(stack.shift()));
          peek();
          break;
        case OPCODES.MSIZE:
          stack.unshift(mem.msize);
          DEBUG && console.log("Memory", mem.data);
          break;
        case OPCODES.SSTORE:
          if (!contextWritable) return error(opcode, stack)

          storage.store(stack.shift(), stack.shift());
          DEBUG && console.log("Storage", storage.data);
          break;
        case OPCODES.SLOAD:
          stack.unshift(storage.load(stack.shift()));
          peek();
          break;
        case OPCODES.RETURN:
          returnValue = mem.load(stack.shift(), stack.shift());
          break;
        case OPCODES.REVERT:
          returnValue = mem.load(stack.shift(), stack.shift());
          return error(opcode, stack, returnValue);
        case OPCODES.SHA3:
          const offset = stack.shift();
          const length = stack.shift();
          if (offset !== undefined && length !== undefined) {
            const value = mem.load(offset, length);
            const hashed = ethers.utils.keccak256(numberToHexFormatted(value));
            stack.unshift(BigInt(hashed));
            peek();
          } else {
            return error(opcode, stack);
          }
          break;
        case OPCODES.ADDRESS:
          stack.unshift(tx.address)
          peek();
          break;
        case OPCODES.CALLER:
          stack.unshift(tx.caller)
          peek();
          break;
        case OPCODES.ORIGIN:
          stack.unshift(tx.origin)
          peek();
          break;
        case OPCODES.GASPRICE:
          stack.unshift(tx.gasPrice)
          peek();
          break;
        case OPCODES.CALLVALUE:
          stack.unshift(tx.value)
          peek();
          break;
        case OPCODES.CALLDATALOAD:
          stack.unshift(loadFromUint8ArrayFn(tx.data, stack.shift()));
          peek();
          break;
        case OPCODES.CALLDATACOPY:
          const destOffset = stack.shift();
          const byteOffset = stack.shift();
          const size = stack.shift();
          const calldata = loadFromUint8ArrayFn(tx.data, byteOffset, size);
          mem.store(destOffset, calldata, size);
          break;
        case OPCODES.CALLDATASIZE:
          stack.unshift(BigInt(tx.data?.length || 0));
          peek();
          break;
        case OPCODES.BASEFEE:
          stack.unshift(block.baseFee)
          peek();
          break;
        case OPCODES.COINBASE:
          stack.unshift(block.coinbase)
          peek();
          break;
        case OPCODES.TIMESTAMP:
          stack.unshift(block.timestamp)
          peek();
          break;
        case OPCODES.NUMBER:
          stack.unshift(block.number)
          peek();
          break;
        case OPCODES.DIFFICULTY:
          stack.unshift(block.difficulty)
          peek();
          break;
        case OPCODES.GASLIMIT:
          stack.unshift(block.gasLimit)
          peek();
          break;
        case OPCODES.CHAINID:
          stack.unshift(block.chainId)
          peek();
          break;
        case OPCODES.BALANCE:
          const address = stack.shift()!;
          stack.unshift(BigInt(state[numberToHexFormatted(address)]?.balance || 0))
          peek();
          break;
        case OPCODES.SELFBALANCE: {
          const address = tx.address;
          stack.unshift(BigInt(state[numberToHexFormatted(address)]?.balance || 0))
          peek();
          break;
        }
        case OPCODES.EXTCODESIZE: {
          const address = stack.shift()!;
          const code = state[numberToHexFormatted(address)]?.code?.bin || "";
          const codeArr = hexStringToUint8Array(code)
          stack.unshift(BigInt(codeArr.length))
          peek();
          break;
        }
        case OPCODES.EXTCODECOPY: {
          const address = stack.shift()!;
          const codeRaw = state[numberToHexFormatted(address)]?.code?.bin || "";
          const code = hexStringToUint8Array(codeRaw)

          const destOffsetCode = stack.shift();
          const byteOffsetCode = stack.shift();
          const sizeCode = stack.shift();
          const codeData = loadFromUint8ArrayFn(code, byteOffsetCode, sizeCode);
          mem.store(destOffsetCode, codeData, sizeCode);
          break;
        }
        case OPCODES.EXTCODEHASH: {
          const address = stack.shift()!;
          const code = state[numberToHexFormatted(address)]?.code?.bin || "";
          if (code.length) {
            const value = `0x${code}`;
            const hashed = ethers.utils.keccak256(value);
            stack.unshift(BigInt(hashed));
          } else {
            stack.unshift(0n);
          }
          peek();
          break;
        }
        case OPCODES.CODESIZE:
          stack.unshift(BigInt(code.length))
          peek();
          break;
        case OPCODES.CODECOPY:
          const destOffsetCode = stack.shift();
          const byteOffsetCode = stack.shift();
          const sizeCode = stack.shift();
          const codeData = loadFromUint8ArrayFn(code, byteOffsetCode, sizeCode);
          mem.store(destOffsetCode, codeData, sizeCode);
          break;
        case OPCODES.STATICCALL:
        case OPCODES.DELEGATECALL:
        case OPCODES.CALL: {
          if (opcode === OPCODES.CALL && !contextWritable) return error(opcode, stack)

          const gas = stack.shift()!;
          const address = stack.shift()!;
          const value = opcode === OPCODES.CALL ? stack.shift()! : tx.value;
          const argsOffset = stack.shift()!;
          const argsSize = stack.shift()!;
          const retOffset = stack.shift()!;
          const retSize = stack.shift()!;

          const dataSub = hexStringToUint8Array(mem.load(argsOffset, argsSize).toString(16));
          const codeRaw = state[numberToHexFormatted(address)]?.code?.bin || "";
          const codeSub = hexStringToUint8Array(codeRaw);

          const addressSub = opcode === OPCODES.DELEGATECALL ? tx.address : address;
          const callerSub = opcode === OPCODES.DELEGATECALL ? tx.caller : tx.address;
          const originSub = opcode === OPCODES.DELEGATECALL ? tx.origin : tx.address;

          const txSub = {
            address: addressSub,
            caller: callerSub,
            origin: originSub,
            gasPrice: gas,
            value,
            data: dataSub,
          } as TransactionData;

          const result = evm(
              codeSub,
              txSub,
              block,
              state,
              opcode !== OPCODES.STATICCALL
          )

          if (result.return) {
            mem.store(retOffset, result.return, retSize);
            lastSubReturn = result.return;
          } else {
            lastSubReturn = undefined;
          }
          stack.unshift(toBigInt(result.success))
          break;
        }
        case OPCODES.RETURNDATASIZE: {
          const lastReturnSize = lastSubReturn ? lastSubReturn.toString(16).length / 2 : 0;
          stack.unshift(BigInt(lastReturnSize));
          break;
        }
        case OPCODES.RETURNDATACOPY: {
          const destOffset = stack.shift();
          const byteOffset = stack.shift();
          const size = stack.shift();
          const returndata = loadFromUint8ArrayFn(hexStringToUint8Array(lastSubReturn!.toString(16)), byteOffset, size);
          mem.store(destOffset, returndata, size);
          break;
        }
        case OPCODES.SELFDESTRUCT: {
          if (!contextWritable) return error(opcode, stack)

          const address = stack.shift()!;

          console.log("Sending funds from ", numberToHexFormatted(tx.address), "to", numberToHexFormatted(address), state)
          // TODO: only alter state if address already exists with a state
          state[numberToHexFormatted(address)] = {
            balance: state[numberToHexFormatted(tx.address)].balance,
            nonce: "0",
            code: {},
            storage: {}
          };

          delete state[numberToHexFormatted(tx.address)]
          break;
        }
      }
    }
    pc++;
  }

  return { success: true, stack, logs, return: returnValue };
}
