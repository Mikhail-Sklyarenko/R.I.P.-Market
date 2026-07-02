export type Trc20Transfer = {
  txHash: string;
  toAddress: string;
  fromAddress: string;
  amountSun: bigint;
  blockNumber: bigint;
  confirmations: number;
};

export type TronGridClient = {
  getLatestBlock(): Promise<bigint>;
  getTrc20Transfers(params: {
    contractAddress: string;
    minBlock: bigint;
    maxBlock: bigint;
    toAddress?: string;
  }): Promise<Trc20Transfer[]>;
  getTransactionConfirmations(txHash: string, latestBlock: bigint): Promise<number>;
};

type TronGridEvent = {
  transaction_id?: string;
  block_number?: number;
  result?: {
    to?: string;
    from?: string;
    value?: string;
  };
};

export function createTronGridClient(params: {
  baseUrl: string;
  apiKey: string;
}): TronGridClient {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (params.apiKey) {
    headers['TRON-PRO-API-KEY'] = params.apiKey;
  }

  async function fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${params.baseUrl}${path}`, { headers });
    if (!response.ok) {
      throw new Error(`TronGrid error ${response.status} for ${path}`);
    }
    return response.json() as Promise<T>;
  }

  return {
    async getLatestBlock(): Promise<bigint> {
      const data = await fetchJson<{ block_header?: { raw_data?: { number?: number } } }>(
        '/wallet/getnowblock',
      );
      const number = data.block_header?.raw_data?.number;
      if (number === undefined) {
        throw new Error('Failed to read latest block');
      }
      return BigInt(number);
    },

    async getTrc20Transfers({
      contractAddress,
      minBlock,
      maxBlock,
      toAddress,
    }): Promise<Trc20Transfer[]> {
      const query = new URLSearchParams({
        contract_address: contractAddress,
        event_name: 'Transfer',
        min_block_number: minBlock.toString(),
        max_block_number: maxBlock.toString(),
        only_confirmed: 'true',
        limit: '200',
      });
      if (toAddress) {
        query.set('to_address', toAddress);
      }

      const data = await fetchJson<{ data?: TronGridEvent[] }>(
        `/v1/contracts/${contractAddress}/events?${query.toString()}`,
      );

      const latest = await this.getLatestBlock();
      const items = data.data ?? [];

      return items
        .filter((item) => item.transaction_id && item.result?.to && item.result.value)
        .map((item) => {
          const blockNumber = BigInt(item.block_number ?? 0);
          return {
            txHash: item.transaction_id!,
            toAddress: item.result!.to!,
            fromAddress: item.result!.from ?? '',
            amountSun: BigInt(item.result!.value!),
            blockNumber,
            confirmations: Number(latest - blockNumber + 1n),
          };
        });
    },

    async getTransactionConfirmations(
      txHash: string,
      latestBlock: bigint,
    ): Promise<number> {
      const data = await fetchJson<{ blockNumber?: number }>(
        `/v1/transactions/${txHash}`,
      );
      if (!data.blockNumber) {
        return 0;
      }
      return Number(latestBlock - BigInt(data.blockNumber) + 1n);
    },
  };
}

export function createMockTronGridClient(
  transfers: Trc20Transfer[],
  latestBlock: bigint,
): TronGridClient {
  return {
    async getLatestBlock() {
      return latestBlock;
    },
    async getTrc20Transfers({ minBlock, maxBlock, toAddress }) {
      return transfers.filter((transfer) => {
        if (transfer.blockNumber < minBlock || transfer.blockNumber > maxBlock) {
          return false;
        }
        if (toAddress && transfer.toAddress !== toAddress) {
          return false;
        }
        return true;
      });
    },
    async getTransactionConfirmations(_txHash, latest) {
      const transfer = transfers.find((item) => item.txHash === _txHash);
      if (!transfer) {
        return 0;
      }
      return Number(latest - transfer.blockNumber + 1n);
    },
  };
}
