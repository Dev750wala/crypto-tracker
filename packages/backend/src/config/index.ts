import dotenv from 'dotenv';
import Joi from 'joi';
import fs from 'node:fs';
import path from 'node:path';

const envFile = [path.resolve(process.cwd(), '.env.local'), path.resolve(process.cwd(), '.env')].find((p) =>
  fs.existsSync(p),
);

dotenv.config({ path: envFile });

const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  RABBITMQ_CONNECTION_STRING: Joi.string().required(),
  RPC_WSS_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  rabbitmqConnectionString: envVars.RABBITMQ_CONNECTION_STRING,
  rpcWssUrl: envVars.RPC_WSS_URL,
  redisUrl: envVars.REDIS_URL,
};
