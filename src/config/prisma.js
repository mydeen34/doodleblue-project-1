const { PrismaClient } = require('@prisma/client');

// Instantiate a single Prisma Client instance to be reused across the application
const prisma = new PrismaClient();

module.exports = prisma;
