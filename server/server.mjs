import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './app.mjs';

const databasePath = fileURLToPath(new URL('../database/meishi.sqlite', import.meta.url));
if (!existsSync(databasePath)) {
  await import('../database/init.mjs');
}

const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys = ON');

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT 必须是 1 到 65535 之间的整数');
  database.close();
  process.exit(1);
}

const server = createApp(database);
server.listen(port, '127.0.0.1', () => {
  console.log(`觅食地图本地服务已启动：http://127.0.0.1:${port}/`);
  console.log(`数据库接口：http://127.0.0.1:${port}/api/places`);
});

server.on('error', error => {
  console.error('服务启动失败：', error.message);
  database.close();
  process.exitCode = 1;
});

function shutdown() {
  server.close(() => database.close());
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
