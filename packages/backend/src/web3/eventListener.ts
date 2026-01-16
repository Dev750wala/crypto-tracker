// src/web3/EventListener.ts
import { createClient } from "redis";
import { ethers } from "ethers";
import { config } from "@/config";
import { TokenABI__factory } from "@/types/factories";
import { eventsNames, USDC_ADDRESS } from "./consts";
import type { TokenABI } from "@/types";
import type { TransferEvent, ApprovalEvent } from "@/types/TokenABI";
import { getRedisClient } from "@/lib/redisClient";

type RedisClient = ReturnType<typeof createClient> extends Promise<any>
  ? Awaited<ReturnType<typeof createClient>>
  : ReturnType<typeof createClient>;

export class EventListener {
  private redis!: RedisClient;
  private provider!: ethers.WebSocketProvider;
  private contract!: TokenABI;

  private batchSize = 9;

  private liveHandlers: { [eventName: string]: (...args: any[]) => void } = {};
  private pingIntervalMs = 30_000;
  private pingTimer?: NodeJS.Timeout;

  static async create(): Promise<EventListener> {
    const inst = new EventListener();
    await inst.init();
    return inst;
  }

  private async init() {
    this.redis = await getRedisClient();

    await this.setupProviderAndContract();
    // await this.fetchMissedEvents();
    this.listenForEvents();

    this.startPingLoop();
  }

  private async setupProviderAndContract() {
    this.provider = new ethers.WebSocketProvider(config.rpcWssUrl as string);
    this.contract = TokenABI__factory.connect(USDC_ADDRESS, this.provider);
  }

  private startPingLoop() {
    if (this.pingTimer) clearInterval(this.pingTimer);

    this.pingTimer = setInterval(async () => {
      try {
        await this.provider.getBlockNumber();
      } catch (err) {
        console.warn("WebSocketProvider ping failed — reconnecting...", err);
        await this.reconnectProvider();
      }
    }, this.pingIntervalMs);
  }

  private async reconnectProvider() {
    try {
      this.removeLiveListeners();

      try {
        if (typeof this.provider.destroy === "function") {
          await this.provider.destroy();
        }
      } catch (_) {
        console.warn("Provider destroy failed during reconnect");
      }

      await this.setupProviderAndContract();

      this.listenForEvents();
    } catch (err) {
      console.error("Reconnect failed:", err);
      setTimeout(() => this.reconnectProvider(), 3000);
    }
  }

  private removeLiveListeners() {
    try {
      for (const evName of Object.keys(this.liveHandlers)) {
        const handler = this.liveHandlers[evName];
        const filter = (this.contract.filters as any)[evName]?.();
        if (filter) {
          this.contract.off(filter, handler);
        }
      }
    } catch (err) {
    } finally {
      this.liveHandlers = {};
    }
  }

  async fetchMissedEvents() {
    try {
      const currentBlock = await this.provider.getBlockNumber();

      const lastProcessedStr = await this.redis.get("lastProcessedBlock");
      let fromBlock = lastProcessedStr ? Number(lastProcessedStr) + 1 : 0;

      if (fromBlock === 0) {
        fromBlock = currentBlock;
      }

      if (fromBlock > currentBlock) {
        console.info("No historical blocks to process:", { fromBlock, currentBlock });
        return;
      }

      const transferFilter = this.contract.filters.Transfer();
      const approvalFilter = this.contract.filters.Approval();

      while (fromBlock <= currentBlock) {
        const toBlock = Math.min(fromBlock + this.batchSize - 1, currentBlock);

        const [transferEvents, approvalEvents] = await Promise.all([
          this.contract.queryFilter(transferFilter, fromBlock, toBlock),
          this.contract.queryFilter(approvalFilter, fromBlock, toBlock),
        ]);

        const allEvents = [...transferEvents, ...approvalEvents].sort((a, b) => {
          if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
        });

        for (const e of allEvents) {
          if (e.eventName === eventsNames.TRANSFER) {
            const args = e.args as TransferEvent.OutputObject;
            console.log("HIST Transfer", {
              blockNumber: e.blockNumber,
              txHash: e.transactionHash,
              from: args.from,
              to: args.to,
              value: args.value.toString(),
            });
          } else if (e.eventName === eventsNames.APPROVAL) {
            const args = e.args as unknown as ApprovalEvent.OutputObject;
            console.log("HIST Approval", {
              blockNumber: e.blockNumber,
              txHash: e.transactionHash,
              owner: args.owner,
              spender: args.spender,
              value: args.value.toString(),
            });
          } else {
            console.log("HIST Unknown event", e.eventName, e.topics);
          }
        }

        await this.redis.set("lastProcessedBlock", String(toBlock));

        fromBlock = toBlock + 1;
      }
    } catch (err) {
      console.error("fetchMissedEvents failed:", err);
    }
  }

  listenForEvents() {
    for (const eventName of Object.values(eventsNames)) {
      const getFilter = (this.contract.filters)[eventName];
      if (typeof getFilter !== "function") {
        console.warn("Filter not found for event:", eventName);
        continue;
      }
      const filter = getFilter.call(this.contract.filters);

      const handler = async (...cbArgs: any[]) => {
        try {
          const ev = cbArgs[cbArgs.length - 1];

          if (eventName === eventsNames.TRANSFER) {
            const args = ev.args as TransferEvent.OutputObject;
            console.log("LIVE Transfer", {
              blockNumber: ev.log.blockNumber,
              txHash: ev.log.transactionHash,
              from: args.from,
              to: args.to,
              value: args.value.toString(),
            });
          } else if (eventName === eventsNames.APPROVAL) {
            const args = ev.args as ApprovalEvent.OutputObject;
            console.log("LIVE Approval", {
              blockNumber: ev.log.blockNumber,
              txHash: ev.log.transactionHash,
              owner: args.owner,
              spender: args.spender,
              value: args.value.toString(),
            });
          } else {
            console.log("LIVE unknown event", ev.event ?? ev.topics);
          }

          if (typeof ev.blockNumber === "number") {
            await this.redis.set("lastProcessedBlock", String(ev.blockNumber));
          }
        } catch (err) {
          console.error("live handler error:", err);
        }
      };

      this.contract.on(filter, handler);
      this.liveHandlers[eventName] = handler;
    }
  }

  async shutdown() {
    try {
      this.removeLiveListeners();
      if (this.pingTimer) clearInterval(this.pingTimer);

      try {
        if (typeof this.provider?.destroy === "function") {
          await this.provider.destroy();
        }
      } catch (_) {}

      if (this.redis) {
        if (typeof (this.redis as any).disconnect === "function") {
          await (this.redis as any).disconnect();
        } else if (typeof (this.redis as any).quit === "function") {
          await (this.redis as any).quit();
        }
      }
    } catch (err) {
      console.warn("shutdown error", err);
    }
  }
}

const main = async () => {
  await EventListener.create();
};

main().catch(console.error);