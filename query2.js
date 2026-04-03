const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_EDGTVZ9Y3Fdl@ep-long-bar-ady5nkk0-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function run() {
  await client.connect();
  const subRes = await client.query('SELECT * FROM "Subscription" WHERE "kioscoId" = \'cmm5z1gq10008r3njx9w89p5z\'');
  console.log("Subscription:", subRes.rows);
  const grantsRes = await client.query('SELECT * FROM "AccessGrant" WHERE "kioscoId" = \'cmm5z1gq10008r3njx9w89p5z\'');
  console.log("Grants:", grantsRes.rows);
  await client.end();
}

run().catch(console.error);
