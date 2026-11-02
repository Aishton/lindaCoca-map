import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

test('旧版反馈表可迁移且保留记录，重复初始化不报错', () => {
  const directory = mkdtempSync(join(tmpdir(), 'meishi-migration-'));
  const source = new URL('./', import.meta.url);
  try {
    for (const name of ['init.mjs', 'schema.sql', 'seed.json']) {
      copyFileSync(new URL(name, source), join(directory, name));
    }
    const database = new DatabaseSync(join(directory, 'meishi.sqlite'));
    database.exec(`
      CREATE TABLE feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place_id TEXT,
        proposed_place_name TEXT,
        feedback_type TEXT NOT NULL,
        details TEXT NOT NULL,
        review_status TEXT NOT NULL DEFAULT '待审核',
        submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TEXT
      );
      INSERT INTO feedback (proposed_place_name, feedback_type, details)
      VALUES ('旧店铺', '位置有误', '原有反馈应保留');
    `);
    database.close();

    execFileSync(process.execPath, [join(directory, 'init.mjs')]);
    execFileSync(process.execPath, [join(directory, 'init.mjs')]);

    const migrated = new DatabaseSync(join(directory, 'meishi.sqlite'));
    assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM feedback').get().count, 1);
    assert.equal(migrated.prepare('SELECT details FROM feedback').get().details, '原有反馈应保留');
    assert.equal(migrated.prepare("SELECT meal_period AS mealPeriod FROM places WHERE name='杨阿姨鸡蛋灌饼'").get().mealPeriod, 'dinner');
    assert.equal(migrated.prepare("SELECT COUNT(*) AS count FROM places WHERE meal_period='both'").get().count, 30);
    assert.ok(migrated.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='feedback_tracking_code'").get());
    migrated.close();
  } finally {
    const temporaryRoot = resolve(tmpdir()) + sep;
    if (!resolve(directory).startsWith(temporaryRoot)) throw new Error('临时目录超出预期范围');
    rmSync(directory, { recursive: true, force: true });
  }
});
