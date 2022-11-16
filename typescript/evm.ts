import {ethers} from "ethers";
import {BlockData, LogEntry, OpResult, StateData, TransactionData} from "./types";
import {
  curry,
  debugOpcode,
  hexStringToUint8Array,
  numberToHexFormatted,
  OPCODES,
  readFromUint8Array,
  toBigInt,
  toSigned,
  toUnsigned,
  UINT256_CEIL
} from "./utils";
import {EvmMemory, EvmStorage} from "./storage";
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

const error = (opcode: number, currentStack: bigint[], returnValue: bigint | undefined = undefined): OpResult => {
  DEBUG && console.log(`Operation ${debugOpcode(opcode)} on invalid stack`, currentStack);
  return {success: false, stack: [], return: returnValue}
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



// persistent storage
const storage = new EvmStorage();

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
  const mem = new EvmMemory();
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
          stack.unshift(readFromUint8Array(tx.data, stack.shift()));
          peek();
          break;
        case OPCODES.CALLDATACOPY:
          const destOffset = stack.shift();
          const byteOffset = stack.shift();
          const size = stack.shift();
          const calldata = readFromUint8Array(tx.data, byteOffset, size);
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
          const codeData = readFromUint8Array(code, byteOffsetCode, sizeCode);
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
          const codeData = readFromUint8Array(code, byteOffsetCode, sizeCode);
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
          const returndata = readFromUint8Array(hexStringToUint8Array(lastSubReturn!.toString(16)), byteOffset, size);
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
