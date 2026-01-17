import express from "express";
import { config } from "@/config";
import { eventConsumer } from "@/services/queue/consumer";
import { startEventListener } from "./web3/eventListener";

const app = express();
const port = config.port;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/consume", async (req, res) => {
  const eventName = req.query.type as string;

  if (!eventName) {
    res.status(400).send("Missing event type parameter.");
    return;
  }

  if (!["Transfer", "Approval", "All"].includes(eventName)) {
    res
      .status(400)
      .send("Invalid event type. Must be 'Transfer', 'Approval', or 'All'.");
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write("data: wait till we set up the listener...\n\n");

  await startEventListener()

  res.write("data: listener set up. waiting for events...\n\n");

  const cleanup = await eventConsumer(
    eventName as "Transfer" | "Approval" | "All",
    (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    () => {
      console.log("Consumer closed");
    }
  );

  req.on("close", () => {
    cleanup();
  });
});

app.listen(port, () => {
  return console.log(`Express is listening at http://localhost:${port}`);
});
