require("dotenv").config();

/** @type {import('prisma/config').PrismaConfig} */
module.exports = {
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
