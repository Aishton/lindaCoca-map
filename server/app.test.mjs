import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './app.mjs';

test('地点列表和详情从 SQLite 返回，缺失地点返回 404', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8'));
  database.prepare(`
    INSERT INTO places (id, name, place_type, source_group, source_label)
    VALUES (?, ?, ?, ?, ?)
  `).run('canteen-demo', '示例食堂', 'canteen', '食堂', '示例食堂');
  database.prepare(`
    INSERT INTO recommendations (id, place_id, name, floor, source_label)
    VALUES (?, ?, ?, ?, ?)
  `).run('rec-demo', 'canteen-demo', '牛肉面', 2, '二楼牛肉面');

  const server = createApp(database);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const list = await fetch(`${base}/api/places`);
    assert.equal(list.status, 200);
    const data = await list.json();
    assert.equal(data.places.length, 1);
    assert.equal(data.places[0].recommendations[0].name, '牛肉面');
    assert.equal(data.places[0].recommendations[0].floor, 2);

    const detail = await fetch(`${base}/api/places/canteen-demo`);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).place.name, '示例食堂');

    const missing = await fetch(`${base}/api/places/unknown`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, 'place_not_found');

    const invalid = await fetch(`${base}/api/places/%ZZ`);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, 'invalid_id');

    const write = await fetch(`${base}/api/places`, { method: 'POST' });
    assert.equal(write.status, 405);

    const health = await fetch(`${base}/api/health`);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /华科觅食/);

    const script = await fetch(`${base}/app.js`);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /loadPlaces\(\)/);

    const seed = await fetch(`${base}/database/seed.json`);
    assert.equal(seed.status, 200);
    assert.ok((await seed.json()).places.length > 0);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    database.close();
  }
});
