import { handlerExchange } from "@/consts";
import { IEventListenerData } from "@/interfaces";
import { rabbitMQConfig } from "@/lib/rabbitmqConfig";
import { routingKeys } from "@/consts";

export async function eventConsumer(
  eventName: "Transfer" | "Approval" | "All",
  onMessage: (data: IEventListenerData) => void,
  onClose: () => void,
) {
  const channel = await rabbitMQConfig.getChannel();

  const { EVENT, TRANSFER, APPROVAL } = routingKeys;
  const routingKey =
    eventName === "Transfer"
      ? `${EVENT}.${TRANSFER}`
      : eventName === "Approval"
      ? `${EVENT}.${APPROVAL}`
      : `${EVENT}.#`;

  const { exchange } = await channel.assertExchange(handlerExchange, "topic", {
    durable: false,
  });

  const { queue } = await channel.assertQueue("", {
    exclusive: true,
  });
  channel.bindQueue(queue, exchange, routingKey);

  const { consumerTag } = await channel.consume(
    queue,
    (msg) => {
      if (msg !== null) {
        const content = msg.content.toString();
        const data: IEventListenerData = JSON.parse(content);

        console.log(" [x] Received %s: %o", msg.fields.routingKey, data);

        channel.ack(msg);

        onMessage(data);
      }
    },
    {
      noAck: false,
    },
  );

  return () => {
    channel.cancel(consumerTag);
    onClose();
  };
}
