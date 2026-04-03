const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_EDGTVZ9Y3Fdl@ep-long-bar-ady5nkk0-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function run() {
  await client.connect();

  const userRes = await client.query("SELECT id FROM \"User\" WHERE email = 'deboradaiana_insfran@hotmail.com'");
  const kioscoRes = await client.query("SELECT id FROM \"Kiosco\" WHERE \"ownerId\" = $1", [userRes.rows[0].id]);
  const branchRes = await client.query("SELECT id FROM \"Branch\" WHERE \"kioscoId\" = $1", [kioscoRes.rows[0].id]);
  const branchIds = branchRes.rows.map(b => b.id);
  
  // ALL restock events in history for these branches
  const restockRes = await client.query("SELECT id, type, note, \"createdAt\" FROM \"RestockEvent\" WHERE \"branchId\" = ANY($1) ORDER BY \"createdAt\" DESC LIMIT 10", [branchIds]);

  let restockItems = [];
  if (restockRes.rows.length > 0) {
      const eIds = restockRes.rows.map(r => r.id);
      const itemsRes = await client.query("SELECT * FROM \"RestockItem\" WHERE \"restockEventId\" = ANY($1)", [eIds]);
      restockItems = itemsRes.rows;
  }

  // Find Products
  const prodRes = await client.query("SELECT id, name FROM \"Product\" WHERE \"kioscoId\" = $1 LIMIT 5", [kioscoRes.rows[0].id]);

  fs.writeFileSync('out3.json', JSON.stringify({
    recentEvents: restockRes.rows,
    items: restockItems,
    products: prodRes.rows
  }, null, 2));

  await client.end();
}

run().catch(console.error);
