// src/web3/EventListener.ts
import { createClient } from "redis";
import { ethers } from "ethers";
import { config } from "@/config";
import { TokenABI__factory } from "@/types/factories";
import { eventsNames, USDC_ADDRESS } from "./consts";
import type { TokenABI } from "@/types";
import type { TransferEvent, ApprovalEvent } from "@/types/TokenABI";

type RedisClient = ReturnType<typeof createClient> extends Promise<any>
  ? Awaited<ReturnType<typeof createClient>>
  : ReturnType<typeof createClient>;

export class EventListener {
  private redis!: RedisClient;
  private provider!: ethers.WebSocketProvider;
  private contract!: TokenABI;

  private batchSize = 100;

  // keep references so we can remove listeners when reconnecting
  private liveHandlers: { [eventName: string]: (...args: any[]) => void } = {};
  private pingIntervalMs = 30_000; // ping every 30s
  private pingTimer?: NodeJS.Timeout;

  private constructor() {} // use create()

  static async create(): Promise<EventListener> {
    const inst = new EventListener();
    await inst.init();
    return inst;
  }

  private async init() {
    // init redis client (example below shows getRedisClient implementation)
    this.redis = await getRedisClient();

    // set up provider and contract and boot processes
    await this.setupProviderAndContract();

    // fetch history (before live listeners to avoid missing)
    await this.fetchMissedEvents();

    // start live listeners
    this.listenForEvents();

    // start a simple keepalive/ping loop to detect broken WS
    this.startPingLoop();
  }

  private async setupProviderAndContract() {
    // create a fresh provider and contract
    this.provider = new ethers.WebSocketProvider(config.rpcWssUrl as string);
    this.contract = TokenABI__factory.connect(USDC_ADDRESS, this.provider);
  }

  private startPingLoop() {
    // clear old
    if (this.pingTimer) clearInterval(this.pingTimer);

    this.pingTimer = setInterval(async () => {
      try {
        // a simple RPC call to check if WS is alive
        await this.provider.getBlockNumber();
      } catch (err) {
        console.warn("WebSocketProvider ping failed — reconnecting...", err);
        await this.reconnectProvider();
      }
    }, this.pingIntervalMs);
  }

  private async reconnectProvider() {
    try {
      // remove existing listeners (if any)
      this.removeLiveListeners();

      // try to destroy the provider if the method exists
      try {
        // provider.destroy exists in ethers v6 but guard in case of different builds
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        if (typeof this.provider.destroy === "function") {
          // @ts-ignore
          await this.provider.destroy();
        }
      } catch (_) {
        // ignore
      }

      // create new provider and reattach contract
      await this.setupProviderAndContract();

      // re-register listeners
      this.listenForEvents();
    } catch (err) {
      console.error("Reconnect failed:", err);
      // Optionally: exponential backoff + retry. Keep simple now.
      setTimeout(() => this.reconnectProvider(), 3000);
    }
  }

  private removeLiveListeners() {
    // remove handlers from contract
    try {
      for (const evName of Object.keys(this.liveHandlers)) {
        const handler = this.liveHandlers[evName];
        const filter = (this.contract.filters as any)[evName]?.();
        if (filter) {
          this.contract.off(filter, handler);
        }
      }
    } catch (err) {
      // ignore: contract might be disconnected
    } finally {
      this.liveHandlers = {};
    }
  }

  async fetchMissedEvents() {
    try {
      const currentBlock = await this.provider.getBlockNumber();

      // read last processed block FROM redis
      const lastProcessedStr = await this.redis.get("lastProcessedBlock");
      // start from lastProcessed + 1 to avoid re-processing the last block
      let fromBlock = lastProcessedStr ? Number(lastProcessedStr) + 1 : 0;

      if (fromBlock === 0) {
        // if redis had nothing, you may want to start near currentBlock - N or 0
        // For safety, start from current block (no backfill). Adjust as needed:
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

        // mark progress in redis (store toBlock - processed up to this block)
        await this.redis.set("lastProcessedBlock", String(toBlock));

        fromBlock = toBlock + 1;
      }
    } catch (err) {
      console.error("fetchMissedEvents failed:", err);
      // Consider retry/backoff here
    }
  }

  listenForEvents() {
    // attach live listeners for each event name
    for (const eventName of Object.values(eventsNames)) {
      // dynamic access to filters object; TypeChain generates .filters.Transfer(), etc.
      const getFilter = (this.contract.filters as any)[eventName];
      if (typeof getFilter !== "function") {
        console.warn("Filter not found for event:", eventName);
        continue;
      }
      const filter = getFilter.call(this.contract.filters);

      const handler = async (...cbArgs: any[]) => {
        try {
          const ev = cbArgs[cbArgs.length - 1]; // last arg is the event object

          if (eventName === eventsNames.TRANSFER) {
            const args = ev.args as TransferEvent.OutputObject;
            console.log("LIVE Transfer", {
              blockNumber: ev.blockNumber,
              txHash: ev.transactionHash,
              from: args.from,
              to: args.to,
              value: args.value.toString(),
            });
          } else if (eventName === eventsNames.APPROVAL) {
            const args = ev.args as ApprovalEvent.OutputObject;
            console.log("LIVE Approval", {
              blockNumber: ev.blockNumber,
              txHash: ev.transactionHash,
              owner: args.owner,
              spender: args.spender,
              value: args.value.toString(),
            });
          } else {
            console.log("LIVE unknown event", ev.event ?? ev.topics);
          }

          // update last processed block
          if (typeof ev.blockNumber === "number") {
            await this.redis.set("lastProcessedBlock", String(ev.blockNumber));
          }
        } catch (err) {
          console.error("live handler error:", err);
        }
      };

      // register handler and keep reference
      this.contract.on(filter, handler);
      this.liveHandlers[eventName] = handler;
    }
  }

  async shutdown() {
    try {
      this.removeLiveListeners();
      if (this.pingTimer) clearInterval(this.pingTimer);

      try {
        // try to destroy provider if method exists
        // @ts-ignore
        if (typeof this.provider?.destroy === "function") {
          // @ts-ignore
          await this.provider.destroy();
        }
      } catch (_) {}

      // graceful redis quit/destroy if available
      if (this.redis) {
        // modern node-redis has .disconnect() or .quit() depending on version
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

/**
 * Simple getRedisClient helper (you can keep your own implementation instead).
 * Uses 'redis' v5 API (createClient + await connect()).
 */
async function getRedisClient() {
  const client = createClient({
    // if you have a URL in env:
    url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  });

  client.on("error", (err) => console.error("Redis Client Error", err));

  await client.connect();
  return client;
}


const main = async () => {
  const eventListener = await EventListener.create();
//   await eventListener.shutdown();
};

main().catch(console.error);