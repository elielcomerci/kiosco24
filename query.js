const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_EDGTVZ9Y3Fdl@ep-long-bar-ady5nkk0-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function run() {
  await client.connect();

  const res1 = await client.query("SELECT id, name, email FROM \"User\" WHERE email = 'deboradaiana_insfran@hotmail.com'");
  const userId = res1.rows[0]?.id;
  
  if (!userId) {
    fs.writeFileSync('out.json', JSON.stringify({ error: 'User not found' }));
    await client.end();
    return;
  }

  const res2 = await client.query("SELECT id, name, \"ownerId\" FROM \"Kiosco\" WHERE \"ownerId\" = $1", [userId]);
  const kioscoIds = res2.rows.map(k => k.id);
  
  if (kioscoIds.length === 0) {
    fs.writeFileSync('out.json', JSON.stringify({ error: 'Kiosco not found' }));
    await client.end();
    return;
  }

  const branchRes = await client.query("SELECT id, name FROM \"Branch\" WHERE \"kioscoId\" = ANY($1)", [kioscoIds]);
  const branchIds = branchRes.rows.map(b => b.id);

  const productRes = await client.query("SELECT id, name FROM \"Product\" WHERE name ILIKE '%Speed%' AND \"kioscoId\" = ANY($1)", [kioscoIds]);
  const productIds = productRes.rows.map(p => p.id);

  let invRes = { rows: [] };
  let variantRes = { rows: [] };
  if (productIds.length > 0) {
      invRes = await client.query("SELECT \"productId\", stock, \"minStock\" FROM \"InventoryRecord\" WHERE \"productId\" = ANY($1) AND \"branchId\" = ANY($2)", [productIds, branchIds]);
      variantRes = await client.query("SELECT id, name, \"productId\" FROM \"Variant\" WHERE \"productId\" = ANY($1)", [productIds]);
  }

  const today = new Date();
  today.setHours(0,0,0,0);
  const restockRes = await client.query("SELECT id, type, note, \"createdAt\" FROM \"RestockEvent\" WHERE \"branchId\" = ANY($1) AND \"createdAt\" >= $2", [branchIds, today]);
  let restockItemsRes = { rows: [] };

  if (restockRes.rows.length > 0) {
      const eventIds = restockRes.rows.map(e => e.id);
      restockItemsRes = await client.query("SELECT * FROM \"RestockEventItem\" WHERE \"restockEventId\" = ANY($1)", [eventIds]);
  }

  const subRes = await client.query("SELECT status FROM \"Subscription\" WHERE \"kioscoId\" = ANY($1)", [kioscoIds]);

  fs.writeFileSync('out.json', JSON.stringify({
    users: res1.rows,
    kioscos: res2.rows,
    branches: branchRes.rows,
    products: productRes.rows,
    inventory: invRes.rows,
    variants: variantRes.rows,
    restockEvents: restockRes.rows,
    restockItems: restockItemsRes.rows,
    subscriptions: subRes.rows,
  }, null, 2));

  await client.end();
}

run().catch(console.error);
