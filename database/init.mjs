import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const directory = dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(join(directory, 'meishi.sqlite'));
const seed = JSON.parse(readFileSync(join(directory, 'seed.json'), 'utf8'));

database.exec('PRAGMA foreign_keys = ON');
database.exec(readFileSync(join(directory, 'schema.sql'), 'utf8'));

const addPlace = database.prepare(`
  INSERT INTO places
    (id, name, place_type, source_group, parent_id, location_note, source_label)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    place_type = excluded.place_type,
    source_group = excluded.source_group,
    parent_id = excluded.parent_id,
    location_note = excluded.location_note,
    source_label = excluded.source_label,
    updated_at = CURRENT_TIMESTAMP
`);

const addRecommendation = database.prepare(`
  INSERT INTO recommendations
    (id, place_id, name, floor, note, source_label)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    place_id = excluded.place_id,
    name = excluded.name,
    floor = excluded.floor,
    note = excluded.note,
    source_label = excluded.source_label
`);

let transactionOpen = false;
try {
  database.exec('BEGIN');
  transactionOpen = true;
  for (const place of seed.places) {
    addPlace.run(
      place.id,
      place.name,
      place.placeType,
      place.sourceGroup,
      place.parentId ?? null,
      place.locationNote ?? null,
      place.sourceLabel,
    );
  }
  for (const item of seed.recommendations) {
    addRecommendation.run(
      item.id,
      item.placeId,
      item.name,
      item.floor ?? null,
      item.note ?? null,
      item.sourceLabel,
    );
  }
  database.exec('COMMIT');
  transactionOpen = false;
  const places = database.prepare('SELECT COUNT(*) AS count FROM places').get().count;
  const recommendations = database.prepare('SELECT COUNT(*) AS count FROM recommendations').get().count;
  console.log(`数据库：${places} 个地点／店铺，${recommendations} 条食物推荐`);
} catch (error) {
  if (transactionOpen) database.exec('ROLLBACK');
  throw error;
} finally {
  database.close();
}
