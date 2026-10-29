import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pagePath = fileURLToPath(new URL('../index.html', import.meta.url));
const scriptPath = fileURLToPath(new URL('../app.js', import.meta.url));
const seedPath = fileURLToPath(new URL('../database/seed.json', import.meta.url));
const placeColumns = `
  id, name, place_type, source_group, parent_id, campus_area,
  location_note, source_label, verification_status, last_confirmed_at
`;
const recommendationColumns = `
  id, place_id, name, floor, note, price_level, meal_period,
  source_label, verification_status
`;

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function mapRecommendation(row) {
  return {
    id: row.id,
    placeId: row.place_id,
    name: row.name,
    floor: row.floor,
    note: row.note,
    priceLevel: row.price_level,
    mealPeriod: row.meal_period,
    sourceLabel: row.source_label,
    verificationStatus: row.verification_status,
  };
}

function mapPlace(row, recommendations) {
  return {
    id: row.id,
    name: row.name,
    placeType: row.place_type,
    sourceGroup: row.source_group,
    parentId: row.parent_id,
    campusArea: row.campus_area,
    locationNote: row.location_note,
    sourceLabel: row.source_label,
    verificationStatus: row.verification_status,
    lastConfirmedAt: row.last_confirmed_at,
    recommendations,
  };
}

export function createApp(database) {
  const allPlaces = database.prepare(`
    SELECT ${placeColumns} FROM places
    ORDER BY CASE source_group WHEN '食堂' THEN 0 ELSE 1 END, name
  `);
  const allRecommendations = database.prepare(`
    SELECT ${recommendationColumns} FROM recommendations
    ORDER BY place_id, COALESCE(floor, 0), id
  `);
  const placeById = database.prepare(`SELECT ${placeColumns} FROM places WHERE id = ?`);
  const recommendationsByPlace = database.prepare(`
    SELECT ${recommendationColumns} FROM recommendations
    WHERE place_id = ? ORDER BY COALESCE(floor, 0), id
  `);

  return createServer((request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;

      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        sendJson(response, 405, { error: 'method_not_allowed', message: '目前只支持 GET 请求' });
        return;
      }

      if (path === '/api/health') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      if (path === '/api/places') {
        const grouped = new Map();
        for (const row of allRecommendations.all()) {
          const items = grouped.get(row.place_id) ?? [];
          items.push(mapRecommendation(row));
          grouped.set(row.place_id, items);
        }
        const places = allPlaces.all().map(row => mapPlace(row, grouped.get(row.id) ?? []));
        sendJson(response, 200, { places });
        return;
      }

      if (path.startsWith('/api/places/')) {
        let id;
        try {
          id = decodeURIComponent(path.slice('/api/places/'.length));
        } catch {
          sendJson(response, 400, { error: 'invalid_id', message: '地点 ID 格式不正确' });
          return;
        }
        if (!id || id.includes('/')) {
          sendJson(response, 400, { error: 'invalid_id', message: '地点 ID 格式不正确' });
          return;
        }
        const row = placeById.get(id);
        if (!row) {
          sendJson(response, 404, { error: 'place_not_found', message: '没有找到该觅食点' });
          return;
        }
        const recommendations = recommendationsByPlace.all(id).map(mapRecommendation);
        sendJson(response, 200, { place: mapPlace(row, recommendations) });
        return;
      }

      if (path === '/' || path === '/index.html') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(readFileSync(pagePath));
        return;
      }

      if (path === '/app.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        response.end(readFileSync(scriptPath));
        return;
      }

      if (path === '/database/seed.json') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(readFileSync(seedPath));
        return;
      }

      if (path.startsWith('/api/')) {
        sendJson(response, 404, { error: 'not_found', message: '接口不存在' });
        return;
      }

      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('页面不存在');
    } catch (error) {
      console.error('处理请求失败：', error);
      if (!response.headersSent) {
        sendJson(response, 500, { error: 'internal_error', message: '服务器暂时无法处理请求' });
      } else {
        response.end();
      }
    }
  });
}
