import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pagePath = fileURLToPath(new URL('../index.html', import.meta.url));
const scriptPath = fileURLToPath(new URL('../app.js', import.meta.url));
const seedPath = fileURLToPath(new URL('../database/seed.json', import.meta.url));
const placeColumns = `
  id, name, place_type, source_group, parent_id, campus_area,
  location_note, map_x, map_y, longitude, latitude, coordinate_source,
  location_status, source_label,
  verification_status, last_confirmed_at
`;
const recommendationColumns = `
  id, place_id, name, floor, note, meal_period,
  source_label, verification_status
`;

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('请求内容过大'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('JSON 格式不正确'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function createTrackingCode() {
  const date = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `FB-${date.year}${date.month}${date.day}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function mapFeedback(row) {
  return {
    trackingCode: row.tracking_code,
    placeId: row.place_id,
    proposedPlaceName: row.proposed_place_name,
    feedbackType: row.feedback_type,
    details: row.details,
    status: row.review_status,
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
  };
}

function mapRecommendation(row) {
  return {
    id: row.id,
    placeId: row.place_id,
    name: row.name,
    floor: row.floor,
    note: row.note,
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
    mapX: row.map_x,
    mapY: row.map_y,
    longitude: row.longitude,
    latitude: row.latitude,
    coordinateSource: row.coordinate_source,
    locationStatus: row.location_status,
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
  const insertFeedback = database.prepare(`
    INSERT INTO feedback
      (tracking_code, place_id, proposed_place_name, feedback_type, details, proposed_payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const feedbackByCode = database.prepare(`
    SELECT tracking_code, place_id, proposed_place_name, feedback_type, details,
           review_status, review_note, submitted_at, reviewed_at
    FROM feedback WHERE tracking_code = ?
  `);
  const validFeedbackTypes = new Set([
    '还在这里', '位置有误', '名称有误', '楼层入口错误', '菜品信息有误',
    '营业时间有误', '暂停营业', '新增位置', '其他',
  ]);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;

      if (request.method === 'GET' && path === '/api/health') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      if (request.method === 'GET' && path === '/api/places') {
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

      if (request.method === 'GET' && path.startsWith('/api/places/')) {
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

      if (request.method === 'POST' && path === '/api/feedbacks') {
        const body = await readJsonBody(request);
        const placeId = body.placeId || null;
        const proposedPlaceName = String(body.proposedPlaceName || '').trim() || null;
        const feedbackType = String(body.feedbackType || '');
        const details = String(body.details || '').trim();
        if (!validFeedbackTypes.has(feedbackType)) {
          sendJson(response, 400, { error: 'invalid_feedback_type', message: '请选择有效的反馈类型' });
          return;
        }
        if (!details || details.length > 500) {
          sendJson(response, 400, { error: 'invalid_details', message: '反馈说明应为 1 至 500 个字符' });
          return;
        }
        if (feedbackType === '新增位置' && !proposedPlaceName) {
          sendJson(response, 400, { error: 'place_name_required', message: '请填写新增地点名称' });
          return;
        }
        if (placeId && !placeById.get(placeId)) {
          sendJson(response, 404, { error: 'place_not_found', message: '没有找到该觅食点' });
          return;
        }
        if (!placeId && feedbackType !== '新增位置') {
          sendJson(response, 400, { error: 'place_required', message: '请选择要反馈的地点' });
          return;
        }
        const trackingCode = createTrackingCode();
        insertFeedback.run(
          trackingCode,
          placeId,
          proposedPlaceName,
          feedbackType,
          details,
          body.proposedPayload ? JSON.stringify(body.proposedPayload) : null,
        );
        const feedback = feedbackByCode.get(trackingCode);
        sendJson(response, 201, { feedback: mapFeedback(feedback) });
        return;
      }

      if (request.method === 'GET' && path.startsWith('/api/feedbacks/')) {
        const trackingCode = decodeURIComponent(path.slice('/api/feedbacks/'.length)).toUpperCase();
        const feedback = feedbackByCode.get(trackingCode);
        if (!feedback) {
          sendJson(response, 404, { error: 'feedback_not_found', message: '没有找到这个反馈编号' });
          return;
        }
        sendJson(response, 200, { feedback: mapFeedback(feedback) });
        return;
      }

      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        sendJson(response, 405, { error: 'method_not_allowed', message: '该接口不支持当前请求方法' });
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
        sendJson(response, error.status || 500, {
          error: error.status ? 'invalid_request' : 'internal_error',
          message: error.status ? error.message : '服务器暂时无法处理请求',
        });
      } else {
        response.end();
      }
    }
  });
}
