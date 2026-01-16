import { config } from "@/config";
import amqp from "amqplib";

export class RabbitMQConfig {
  private connection?: amqp.Connection;
  private channel?: amqp.Channel;

  async connect(): Promise<amqp.Channel> {
    if (this.channel) return this.channel;

    this.connection = await amqp.connect(config.rabbitmqConnectionString);
    this.channel = await this.connection.createChannel();

    return this.channel;
  }

  async getChannel(): Promise<amqp.Channel> {
    if (this.channel) return this.channel;
    return this.connect();
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
    this.channel = undefined;
    this.connection = undefined;
  }
}

export const rabbitMQConfig = new RabbitMQConfig();