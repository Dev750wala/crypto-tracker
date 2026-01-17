import { handlerExchange } from "@/consts";
import { IEventListenerData } from "@/interfaces";
import { rabbitMQConfig } from "@/lib/rabbitmqConfig";
import { routingKeys } from "@/consts";
import { replacer } from "@/utils/replacer";

export async function eventHandlerProducer(data: IEventListenerData) {
  const channel = await rabbitMQConfig.getChannel();

  const { EVENT, TRANSFER, APPROVAL } = routingKeys;

  const routingKey =
    data.eventName === "Transfer"
      ? `${EVENT}.${TRANSFER}`
      : `${EVENT}.${APPROVAL}`;

  const { exchange } = await channel.assertExchange(handlerExchange, "topic", {
    durable: false,
  });

  console.log(" [x] Sent %s: %o", routingKey, data);
  channel.publish(
    exchange,
    routingKey,
    Buffer.from(JSON.stringify(data, replacer)),
    {
      persistent: false,
      correlationId: data.transactionHash,
    },
  );
}
