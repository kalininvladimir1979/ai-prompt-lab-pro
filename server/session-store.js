import { Redis } from "@upstash/redis";
import crypto from "node:crypto";

const SESSION_TTL_SECONDS = 2 * 60 * 60;
const keyFor = (id) => `promptlab:session:${id}`;

// Local development remains usable without a cloud account. A Vercel deployment
// uses Upstash Redis whenever its integration variables are present.
const memory = new Map();
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

export const sessionStorageMode = redis ? "upstash" : "memory";
export const SESSION_COOKIE = "promptlab_session";
export const sessionTtlSeconds = SESSION_TTL_SECONDS;

export const createSession = async (payload) => {
  const id = crypto.randomBytes(32).toString("base64url");
  const value = {
    ...payload,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  };
  if (redis) await redis.set(keyFor(id), value, { ex: SESSION_TTL_SECONDS });
  else memory.set(id, { value, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 });
  return id;
};

export const getSession = async (id) => {
  if (!id) return null;
  if (redis) return (await redis.get(keyFor(id))) || null;
  const entry = memory.get(id);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(id);
    return null;
  }
  return entry.value;
};

// The expiry is intentionally fixed at creation: saving a key or changing a
// setting never quietly prolongs the stated two-hour lifetime.
export const updateSession = async (id, value) => {
  if (!id) return false;
  if (redis) {
    const ttl = await redis.ttl(keyFor(id));
    if (ttl <= 0) return false;
    await redis.set(keyFor(id), value, { ex: ttl });
    return true;
  }
  const entry = memory.get(id);
  if (!entry || entry.expiresAt <= Date.now()) {
    memory.delete(id);
    return false;
  }
  memory.set(id, { value, expiresAt: entry.expiresAt });
  return true;
};

export const deleteSession = async (id) => {
  if (!id) return;
  if (redis) await redis.del(keyFor(id));
  else memory.delete(id);
};
