import { createClient } from 'redis';
import { config } from '@/config';

export async function getRedisClient() {
  const client = createClient({ url: config.redisUrl });
  await client.connect();
  return client;
}
