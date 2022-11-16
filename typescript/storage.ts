import {numberToHexFormatted} from "./utils";

export class EvmMemory {
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

export class EvmStorage {
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
