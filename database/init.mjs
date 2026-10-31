import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const directory = dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(join(directory, 'meishi.sqlite'));
const seed = JSON.parse(readFileSync(join(directory, 'seed.json'), 'utf8'));

database.exec('PRAGMA foreign_keys = ON');
database.exec(readFileSync(join(directory, 'schema.sql'), 'utf8'));

// 为已经生成过的本地数据库补充地图字段。
const placeColumns = new Set(database.prepare('PRAGMA table_info(places)').all().map(column => column.name));
if (!placeColumns.has('map_x')) database.exec('ALTER TABLE places ADD COLUMN map_x REAL');
if (!placeColumns.has('map_y')) database.exec('ALTER TABLE places ADD COLUMN map_y REAL');
if (!placeColumns.has('longitude')) database.exec('ALTER TABLE places ADD COLUMN longitude REAL');
if (!placeColumns.has('latitude')) database.exec('ALTER TABLE places ADD COLUMN latitude REAL');
if (!placeColumns.has('coordinate_source')) database.exec('ALTER TABLE places ADD COLUMN coordinate_source TEXT');
if (!placeColumns.has('location_status')) {
  database.exec("ALTER TABLE places ADD COLUMN location_status TEXT NOT NULL DEFAULT '未定位'");
}

const addPlace = database.prepare(`
  INSERT INTO places
    (id, name, place_type, source_group, parent_id, campus_area, location_note,
     map_x, map_y, longitude, latitude, coordinate_source, location_status, source_label)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    place_type = excluded.place_type,
    source_group = excluded.source_group,
    parent_id = excluded.parent_id,
    campus_area = excluded.campus_area,
    location_note = excluded.location_note,
    map_x = excluded.map_x,
    map_y = excluded.map_y,
    longitude = excluded.longitude,
    latitude = excluded.latitude,
    coordinate_source = excluded.coordinate_source,
    location_status = excluded.location_status,
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
      place.campusArea ?? null,
      place.locationNote ?? null,
      place.mapX ?? null,
      place.mapY ?? null,
      place.longitude ?? null,
      place.latitude ?? null,
      place.coordinateSource ?? null,
      place.locationStatus ?? '未定位',
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
