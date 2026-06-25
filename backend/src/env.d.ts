/// <reference types="node" />

declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    DIRECT_URL: string;
    REDIS_URL: string;
    OPENAI_API_KEY: string;
    LANGSMITH_API_KEY: string;
    META_ACCESS_TOKEN: string;
    META_PHONE_NUMBER_ID: string;
    META_WEBHOOK_VERIFY_TOKEN: string;
    AES_SECRET_KEY: string;
    NODE_ENV: "development" | "production" | "test";
    PORT: string;
  }
}
