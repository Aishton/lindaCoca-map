// 首页优先读取本地 API；GitHub Pages 没有 Node 服务时读取仓库内的公开种子数据。
const state = {
  places: [],
  meal: new Date().getHours() >= 10 && new Date().getHours() < 15 ? 'lunch' : 'dinner',
  types: new Set(),
  area: 'all',
  placeType: 'all',
  results: [],
  source: '',
  quickMode: false,
  homeRecommendationActive: false,
  mapType: 'all',
  selectedMapPlaceId: null,
  calibrationMode: false,
  calibrationTargetId: null,
  calibrations: [],
};

const calibrationStorageKey = 'hustmap-calibration-draft-v2';
const feedbackStorageKey = 'hustmap-feedback-v1';

const typePatterns = {
  米饭: /饭|粥|煲/,
  面食: /面|粉|饺|馄饨|抄手|米线|饼/,
  快餐: /汉堡|鸡排|饭团|披萨|卷/,
  清淡: /轻食|粥|燕麦|牛奶|桃胶/,
  辣: /麻辣|酸汤|冒菜|水煮|油泼/,
  甜品: /糕点|桃胶|驴打滚|红薯/,
};

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function mealLabel() {
  return state.meal === 'lunch' ? '午餐' : '晚餐';
}

function areaLabel(area = state.area) {
  return ({ east: '东区', central: '中区', west: '西区' }[area] || '不限区域');
}

function placeTypeLabel(type = state.placeType) {
  return type === 'canteen' ? '食堂／窗口' : type === 'shop' ? '校内店铺' : '不限类型';
}

function placeLabel(place) {
  if (place.parentId) {
    const parent = state.places.find(item => item.id === place.parentId);
    if (parent) return `${parent.name} · ${place.sourceGroup}`;
  }
  return place.sourceGroup;
}

function dishLabel(item) {
  return `${item.floor ? `${item.floor} 楼 · ` : ''}${item.name}`;
}

function dishesOf(place) {
  return place.recommendations.map(dishLabel).join(' · ');
}

function categoriesForText(words) {
  return Object.entries(typePatterns)
    .filter(([, pattern]) => pattern.test(words))
    .map(([category]) => category);
}

function categoriesOf(place) {
  return categoriesForText([place.name, ...place.recommendations.map(item => item.name)].join(' '));
}

function chooseResult(place, quick) {
  if (place.placeType !== 'canteen' || !place.recommendations.length) {
    return { ...place, featuredRecommendation: null };
  }
  let choices = place.recommendations;
  if (!quick && state.types.size) {
    const matching = choices.filter(item => categoriesForText(item.name).some(type => state.types.has(type)));
    if (matching.length) choices = matching;
  }
  return { ...place, featuredRecommendation: choices[Math.floor(Math.random() * choices.length)] };
}

function locationFor(place, featuredRecommendation = null) {
  if (place.placeType === 'canteen') {
    if (!featuredRecommendation?.floor) return place.name;
    const floor = { 1: '一', 2: '二', 3: '三' }[featuredRecommendation.floor] ?? featuredRecommendation.floor;
    return `${place.name.replace(/食堂$/, '')}${floor}楼`;
  }
  const location = (place.locationNote || '').split(/[；;]/)[0].trim();
  if (location) return location;
  if (place.parentId) {
    const parent = state.places.find(item => item.id === place.parentId);
    if (parent) return parent.name;
  }
  return place.name;
}

function normalizePlaces(list) {
  if (!Array.isArray(list)) throw new Error('地点数据格式不正确');
  return list.map(place => ({
    ...place,
    mapX: place.mapX !== null && place.mapX !== undefined && Number.isFinite(Number(place.mapX)) ? Number(place.mapX) : null,
    mapY: place.mapY !== null && place.mapY !== undefined && Number.isFinite(Number(place.mapY)) ? Number(place.mapY) : null,
    longitude: place.longitude !== null && place.longitude !== undefined && Number.isFinite(Number(place.longitude)) ? Number(place.longitude) : null,
    latitude: place.latitude !== null && place.latitude !== undefined && Number.isFinite(Number(place.latitude)) ? Number(place.latitude) : null,
    coordinateSource: place.coordinateSource || null,
    locationStatus: place.locationStatus || '未定位',
    recommendations: Array.isArray(place.recommendations) ? place.recommendations : [],
  }));
}

function fromSeed(seed) {
  if (!Array.isArray(seed.places) || !Array.isArray(seed.recommendations)) {
    throw new Error('种子数据格式不正确');
  }
  const byPlace = new Map(seed.places.map(place => [place.id, []]));
  for (const item of seed.recommendations) {
    byPlace.get(item.placeId)?.push({
      id: item.id,
      placeId: item.placeId,
      name: item.name,
      floor: item.floor ?? null,
      note: item.note ?? null,
      mealPeriod: null,
      sourceLabel: item.sourceLabel,
      verificationStatus: '待确认',
    });
  }
  return seed.places.map(place => ({
    id: place.id,
    name: place.name,
    placeType: place.placeType,
    sourceGroup: place.sourceGroup,
    parentId: place.parentId ?? null,
    campusArea: place.campusArea ?? null,
    locationNote: place.locationNote ?? null,
    mapX: place.mapX ?? null,
    mapY: place.mapY ?? null,
    longitude: place.longitude ?? null,
    latitude: place.latitude ?? null,
    coordinateSource: place.coordinateSource ?? null,
    locationStatus: place.locationStatus ?? '未定位',
    sourceLabel: place.sourceLabel,
    verificationStatus: '待确认',
    lastConfirmedAt: null,
    recommendations: byPlace.get(place.id) ?? [],
  }));
}

async function readJson(path) {
  const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}：HTTP ${response.status}`);
  return response.json();
}

async function loadPlaces() {
  try {
    const data = await readJson('./api/places');
    state.places = normalizePlaces(data.places);
    state.source = '本地数据库';
  } catch (apiError) {
    try {
      const seed = await readJson('./database/seed.json');
      state.places = normalizePlaces(fromSeed(seed));
      state.source = '项目组公开清单';
    } catch (seedError) {
      console.error('加载觅食点失败：', apiError, seedError);
      $('#home-feed-list').innerHTML = '<div class="empty">数据加载失败，请刷新页面重试。</div>';
      $('#adminlist').textContent = '数据加载失败，请通过本地服务或 GitHub Pages 打开网页后重试。';
      toast('觅食点加载失败，请刷新页面重试');
      return;
    }
  }

  $('#home-feed-count').textContent = `已收集 ${state.places.length} 个地点 · ${state.source}`;
  $('#count').textContent = `${state.places.length} 个地点`;
  loadCalibrationDraft();
  renderCalibrationPanel();
  renderAllPlaces();
  renderMap();
  renderHomeFeed();
  populateFeedbackPlaces();
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2300);
}

function go(view, { resetScroll = true, updateHistory = true } = {}) {
  document.querySelectorAll('.view').forEach(element => {
    element.classList.toggle('active', element.id === view);
  });
  const activeNav = ['results', 'detail'].includes(view) ? 'home' : view;
  document.querySelectorAll('.nav [data-go]').forEach(button => {
    if (button.dataset.go === activeNav) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (view === 'admin') renderAllPlaces();
  if (view === 'review') renderReview();
  if (view === 'home') {
    renderMap();
    setTimeout(() => leafletMap?.invalidateSize(), 0);
  }
  if (updateHistory && location.hash !== `#${view}`) history.pushState({ view }, '', `#${view}`);
  if (resetScroll) scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToMap(behavior = 'smooth') {
  go('home', { resetScroll: false, updateHistory: false });
  if (location.hash !== '#map') history.pushState({ view: 'map' }, '', '#map');
  setTimeout(() => {
    const mapSection = $('#home-map');
    if (mapSection) {
      const top = mapSection.getBoundingClientRect().top + window.scrollY - 18;
      window.scrollTo({ top, behavior });
    }
    leafletMap?.invalidateSize();
  }, 80);
}

let leafletMap = null;
let leafletMarkerLayer = null;
const leafletMarkerByPlace = new Map();

function mapKind(place) {
  return place.placeType === 'canteen' || place.placeType === 'stall' || place.sourceGroup === '食堂'
    ? 'canteen'
    : 'shop';
}

function calibrationTargets() {
  const groups = new Map();
  for (const place of state.places) {
    if (place.longitude === null || place.latitude === null) continue;
    const key = `${place.longitude.toFixed(7)}:${place.latitude.toFixed(7)}`;
    const group = groups.get(key) ?? {
      id: place.id,
      placeIds: [],
      names: [],
      originalLatitude: place.latitude,
      originalLongitude: place.longitude,
    };
    group.placeIds.push(place.id);
    group.names.push(place.name);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const places = group.placeIds.map(id => state.places.find(place => place.id === id)).filter(Boolean);
    const parent = places.find(place => place.placeType === 'food_court');
    const sharedLocation = places.every(place => place.locationNote && place.locationNote === places[0]?.locationNote)
      ? places[0].locationNote
      : null;
    return { ...group, label: parent?.name || sharedLocation || places[0]?.name || group.id };
  });
}

function calibrationForPlace(id) {
  return state.calibrations.find(item => item.placeIds.includes(id)) ?? null;
}

function effectiveCoordinates(place) {
  const calibration = calibrationForPlace(place.id);
  return calibration
    ? { latitude: calibration.latitude, longitude: calibration.longitude }
    : { latitude: place.latitude, longitude: place.longitude };
}

function loadCalibrationDraft() {
  try {
    const stored = JSON.parse(localStorage.getItem(calibrationStorageKey) || '[]');
    const validIds = new Set(state.places.map(place => place.id));
    state.calibrations = Array.isArray(stored) ? stored.filter(item => (
      Array.isArray(item.placeIds)
      && item.placeIds.length
      && item.placeIds.every(id => validIds.has(id))
      && Number.isFinite(Number(item.latitude))
      && Number.isFinite(Number(item.longitude))
    )).map(item => ({ ...item, latitude: Number(item.latitude), longitude: Number(item.longitude) })) : [];
  } catch (error) {
    console.warn('读取校准草稿失败：', error);
    state.calibrations = [];
  }
}

function saveCalibrationDraft() {
  try {
    localStorage.setItem(calibrationStorageKey, JSON.stringify(state.calibrations));
  } catch (error) {
    console.warn('保存校准草稿失败：', error);
    toast('浏览器无法保存草稿，请及时下载校准结果');
  }
}

function calibrationExport() {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: '华科觅食地图浏览器校准草稿；人工圈点仅作为大致位置，尚未写入线上数据',
    calibrations: state.calibrations.map(item => ({
      targetId: item.targetId,
      label: item.label,
      placeIds: item.placeIds,
      names: item.names,
      latitude: item.latitude,
      longitude: item.longitude,
      locationStatus: '大致位置',
      originalLatitude: item.originalLatitude,
      originalLongitude: item.originalLongitude,
    })),
  };
}

function renderCalibrationPanel() {
  const panel = $('#calibration-panel');
  const select = $('#calibration-target');
  if (!panel || !select) return;
  const targets = calibrationTargets();
  if (!state.calibrationTargetId || !targets.some(target => target.id === state.calibrationTargetId)) {
    state.calibrationTargetId = targets[0]?.id ?? null;
  }
  select.innerHTML = targets.map(target => {
    const done = state.calibrations.some(item => item.targetId === target.id);
    return `<option value="${escapeHtml(target.id)}"${target.id === state.calibrationTargetId ? ' selected' : ''}>${done ? '✓ ' : ''}${escapeHtml(target.label)}${target.names.length > 1 ? `（${target.names.length} 个地点）` : ''}</option>`;
  }).join('');
  panel.hidden = !state.calibrationMode;
  $('#campus-map').classList.toggle('calibration-active', state.calibrationMode);
  const current = state.calibrations.find(item => item.targetId === state.calibrationTargetId);
  const status = current
    ? `<strong>当前已记录</strong><br>${current.latitude.toFixed(7)}, ${current.longitude.toFixed(7)}`
    : '<strong>当前尚未记录</strong><br>请在地图上单击正确位置';
  $('#calibration-status').innerHTML = `${status}<br>本浏览器已记录：${state.calibrations.length} 处`;
  $('#calibration-undo').disabled = !current;
  $('#calibration-copy').disabled = state.calibrations.length === 0;
  $('#calibration-download').disabled = state.calibrations.length === 0;
  $('#calibration-clear').disabled = state.calibrations.length === 0;
}

function focusCalibrationTarget() {
  const target = calibrationTargets().find(item => item.id === state.calibrationTargetId);
  if (!target || !leafletMap) return;
  const marker = target.placeIds.map(id => leafletMarkerByPlace.get(id)).find(Boolean);
  const calibration = state.calibrations.find(item => item.targetId === target.id);
  const point = marker?.getLatLng() ?? (calibration
    ? { lat: calibration.latitude, lng: calibration.longitude }
    : { lat: target.originalLatitude, lng: target.originalLongitude });
  leafletMap.flyTo(point, Math.max(17, leafletMap.getZoom()), { duration: 0.55 });
}

function recordCalibration(latitude, longitude) {
  const target = calibrationTargets().find(item => item.id === state.calibrationTargetId);
  if (!target) return toast('请先选择一个待校准地点');
  const record = {
    ...target,
    targetId: target.id,
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
  };
  state.calibrations = state.calibrations.filter(item => item.targetId !== target.id);
  state.calibrations.push(record);
  saveCalibrationDraft();
  renderMap();
  renderCalibrationPanel();
  toast(`已记录：${target.label}`);
}

function stopCalibration() {
  state.calibrationMode = false;
  renderCalibrationPanel();
  toast('已退出位置校准');
}

function startCalibrationForPlace(id) {
  const target = calibrationTargets().find(item => item.placeIds.includes(id));
  if (!target) return toast('这个地点暂时没有可校准的地图标记');
  state.calibrationTargetId = target.id;
  state.calibrationMode = true;
  state.mapType = 'all';
  $('#map-search').value = '';
  document.querySelectorAll('#map-filters [data-map-type]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mapType === 'all'));
  });
  closeMapPopup();
  renderMap();
  renderCalibrationPanel();
  scrollToMap();
  setTimeout(focusCalibrationTarget, 180);
  toast(`请在地图上单击“${target.label}”的正确位置`);
}

async function copyCalibrationResult() {
  const text = JSON.stringify(calibrationExport(), null, 2);
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    toast('校准结果已复制，可以直接发给项目维护者');
  } catch (error) {
    console.warn('复制校准结果失败：', error);
    toast('复制失败，请使用“下载 JSON”');
  }
}

function downloadCalibrationResult() {
  const blob = new Blob([JSON.stringify(calibrationExport(), null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hustmap-calibration-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast('校准结果已下载');
}

function mapGroups() {
  const groups = new Map();
  for (const place of state.places) {
    const coordinates = effectiveCoordinates(place);
    if (coordinates.longitude === null || coordinates.latitude === null) continue;
    const key = `${coordinates.longitude.toFixed(5)}:${coordinates.latitude.toFixed(5)}`;
    const group = groups.get(key) ?? {
      longitude: coordinates.longitude,
      latitude: coordinates.latitude,
      places: [],
    };
    group.places.push(place);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function mapGroupMatches(group) {
  const query = ($('#map-search')?.value || '').trim().toLocaleLowerCase();
  return group.places.some(place => {
    const kindMatches = state.mapType === 'all' || mapKind(place) === state.mapType;
    const textMatches = !query || [place.name, place.locationNote, ...place.recommendations.map(item => item.name)]
      .some(value => String(value ?? '').toLocaleLowerCase().includes(query));
    return kindMatches && textMatches;
  });
}

function initializeLeafletMap() {
  if (leafletMap) return true;
  const container = $('#campus-map');
  if (!container) return false;
  if (!window.L) {
    $('#map-loading').innerHTML = '在线地图组件加载失败，请检查网络后刷新。<br><a href="https://map.hust.edu.cn/" target="_blank" rel="noopener">打开华科官方地图</a>';
    return false;
  }

  leafletMap = L.map(container, {
    minZoom: 14,
    maxZoom: 19,
    zoomControl: true,
  });
  leafletMarkerLayer = L.layerGroup().addTo(leafletMap);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    minZoom: 14,
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  });
  tiles.on('load', () => container.classList.add('is-ready'));
  tiles.addTo(leafletMap);
  leafletMap.fitBounds([
    [30.5074, 114.3972],
    [30.5215, 114.4328],
  ], { padding: [22, 22] });
  leafletMap.on('popupclose', () => {
    state.selectedMapPlaceId = null;
    updateLeafletMarkerIcons();
  });
  leafletMap.on('click', event => {
    if (!state.calibrationMode) return;
    recordCalibration(event.latlng.lat, event.latlng.lng);
  });
  setTimeout(() => container.classList.add('is-ready'), 1800);
  return true;
}

function markerIcon(group) {
  const primary = group.places.find(place => place.placeType === 'canteen') ?? group.places[0];
  const approximate = group.places.some(place => place.locationStatus !== '已确认' || calibrationForPlace(place.id));
  const selected = group.places.some(place => place.id === state.selectedMapPlaceId);
  const recommended = state.homeRecommendationActive && group.places.some(place => state.results.some(result => result.id === place.id));
  const dimmed = state.homeRecommendationActive && !recommended;
  const calibrated = group.places.some(place => calibrationForPlace(place.id));
  return L.divIcon({
    className: 'food-map-icon',
    html: `<span class="geo-marker ${mapKind(primary) === 'shop' ? 'shop' : ''} ${approximate ? 'approximate' : ''} ${selected ? 'selected' : ''} ${recommended ? 'recommended' : ''} ${dimmed ? 'dimmed' : ''} ${calibrated ? 'calibrated' : ''}"><span>${group.places.length > 1 ? group.places.length : '•'}</span></span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -34],
  });
}

function mapPopupContent(places) {
  const first = places[0];
  const hasCalibrationDraft = places.some(place => calibrationForPlace(place.id));
  const parent = places.find(place => place.placeType === 'food_court');
  const sharedLocation = places.every(place => place.locationNote && place.locationNote === first.locationNote)
    ? first.locationNote
    : null;
  const groupTitle = parent?.name || sharedLocation || first.name;
  const source = first.coordinateSource ? `<p>坐标来源：${escapeHtml(first.coordinateSource)}</p>` : '';
  const locationStatus = hasCalibrationDraft ? '大致位置（本地校准草稿）' : first.locationStatus;
  return `<h3>${escapeHtml(groupTitle)}</h3><p>${escapeHtml(places.map(place => place.name).join(' · '))}</p><p><span class="location-status">${escapeHtml(locationStatus)}</span>${first.locationNote && first.locationNote !== groupTitle ? ` · ${escapeHtml(first.locationNote)}` : ''}</p>${source}${places.map(place => `<button class="secondary" data-map-detail="${escapeHtml(place.id)}">查看${escapeHtml(place.name)}详情</button>`).join('')}`;
}

function updateLeafletMarkerIcons() {
  for (const marker of new Set(leafletMarkerByPlace.values())) {
    marker.setIcon(markerIcon(marker.foodGroup));
  }
}

function renderMap() {
  const groups = mapGroups();
  const visible = groups.filter(mapGroupMatches);
  $('#map-count').textContent = `${visible.reduce((sum, group) => sum + group.places.length, 0)} 个地点 · ${visible.length} 个标记`;
  if (!initializeLeafletMap()) return;

  leafletMarkerLayer.clearLayers();
  leafletMarkerByPlace.clear();
  for (const group of visible) {
    const names = group.places.map(place => place.name).join('、');
    const marker = L.marker([group.latitude, group.longitude], {
      icon: markerIcon(group),
      title: names,
      alt: names,
      keyboard: true,
      bubblingMouseEvents: false,
    });
    marker.foodGroup = group;
    marker.bindPopup(mapPopupContent(group.places), { maxWidth: 300, minWidth: 220 });
    marker.on('click', () => {
      state.selectedMapPlaceId = group.places[0].id;
      updateLeafletMarkerIcons();
    });
    marker.addTo(leafletMarkerLayer);
    for (const place of group.places) leafletMarkerByPlace.set(place.id, marker);
  }

  if (state.selectedMapPlaceId && !leafletMarkerByPlace.has(state.selectedMapPlaceId)) {
    closeMapPopup();
  }
  setTimeout(() => leafletMap.invalidateSize(), 0);
}

function closeMapPopup() {
  state.selectedMapPlaceId = null;
  leafletMap?.closePopup();
  updateLeafletMarkerIcons();
}

function showMapPopup(ids) {
  const marker = ids.map(id => leafletMarkerByPlace.get(id)).find(Boolean);
  if (!marker) return;
  state.selectedMapPlaceId = marker.foodGroup.places[0].id;
  updateLeafletMarkerIcons();
  marker.openPopup();
  leafletMap.panTo(marker.getLatLng(), { animate: true });
}

function focusPlaceOnMap(id, { scroll = true } = {}) {
  const original = state.places.find(place => place.id === id);
  if (!original) return;
  const place = original.parentId ? state.places.find(item => item.id === original.parentId) ?? original : original;
  state.mapType = 'all';
  $('#map-search').value = '';
  document.querySelectorAll('#map-filters [data-map-type]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mapType === 'all'));
  });
  if (scroll) scrollToMap();
  setTimeout(() => {
    const marker = leafletMarkerByPlace.get(place.id) ?? leafletMarkerByPlace.get(original.id);
    if (!marker) return;
    leafletMap.flyTo(marker.getLatLng(), Math.max(17, leafletMap.getZoom()), { duration: 0.65 });
    showMapPopup([place.id, original.id]);
  }, scroll ? 180 : 40);
}

function updateMealButtons() {
  document.querySelectorAll('#meal [data-v]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.v === state.meal));
  });
}

function candidates(quick) {
  if (quick) return [...state.places];
  return state.places.filter(place => {
    const areaMatches = state.area === 'all' || place.campusArea === state.area;
    const typeMatches = state.placeType === 'all' || mapKind(place) === state.placeType;
    const preferenceMatches = state.types.size === 0
      || categoriesOf(place).some(type => state.types.has(type));
    return areaMatches && typeMatches && preferenceMatches;
  });
}

function shuffled(list) {
  const output = [...list];
  for (let index = output.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [output[index], output[other]] = [output[other], output[index]];
  }
  return output;
}

function recommend(quick) {
  if (!state.places.length) return toast('觅食点尚未加载，请稍后重试');
  state.quickMode = quick;
  if (quick) {
    state.meal = new Date().getHours() >= 10 && new Date().getHours() < 15 ? 'lunch' : 'dinner';
    updateMealButtons();
  }
  state.results = shuffled(candidates(quick)).slice(0, 3).map(place => chooseResult(place, quick));
  $('#resulttext').textContent = quick
    ? '从项目组清单中随机挑选；实际营业时段请到店确认。'
    : '按区域、地点类型和菜名偏好筛选；午餐／晚餐仅作场景标记，营业时段待核实。';
  $('#meta').textContent = quick
    ? `${mealLabel()}想吃什么 · ${state.source}`
    : `${areaLabel()} · ${placeTypeLabel()} · ${state.source}`;
  renderResults();
  state.homeRecommendationActive = true;
  setDecisionTab('quick');
  renderHomeFeed();
  renderMap();
  setTimeout(() => focusRecommendedOnMap(), 80);
}

function setDecisionTab(tab) {
  document.querySelectorAll('[data-decision-tab]').forEach(button => {
    button.setAttribute('aria-selected', String(button.dataset.decisionTab === tab));
  });
  $('#decision-quick-pane').hidden = tab !== 'quick';
  $('#decision-filter-pane').hidden = tab !== 'filter';
}

function recentPlaces() {
  return state.places.slice(-4).reverse();
}

function homeFeedCard(place, index, recommended) {
  const featured = place.featuredRecommendation;
  const description = recommended
    ? `推荐菜品：${featured?.name || '已收集菜品线索'}`
    : `${placeLabel(place)} · ${locationFor(place)}`;
  return `<button class="feed-card" type="button" data-home-focus="${escapeHtml(place.id)}" aria-label="在地图中查看${escapeHtml(place.name)}">
    <span class="feed-card-top"><span class="zone pending">${escapeHtml(recommended ? '为你推荐' : placeLabel(place))}</span>${recommended ? `<span class="score">${escapeHtml(place.verificationStatus || '待确认')}</span>` : ''}</span>
    <h3>${escapeHtml(place.name)}</h3><p>${escapeHtml(description)}</p><span class="feed-cta">在地图中查看 →</span>
  </button>`;
}

function renderHomeFeed() {
  const list = $('#home-feed-list');
  if (!list) return;
  const recommended = state.homeRecommendationActive;
  const items = recommended ? state.results : recentPlaces();
  $('#home-feed-pill').textContent = recommended ? '推荐结果' : '本期新收录';
  $('#home-feed-title').textContent = recommended
    ? `${items.length || '暂无'} 个觅食选择`
    : '新发现的觅食点';
  $('#home-feed-copy').textContent = recommended
    ? '地图已高亮这些地点；点击任意卡片，左侧地图会立即聚焦。'
    : '看看项目组刚整理进清单的地点，点击卡片可在地图中定位。';
  list.innerHTML = items.length
    ? items.map((place, index) => homeFeedCard(place, index, recommended)).join('')
    : '<div class="empty">没有匹配当前条件的地点，请放宽筛选后重试。</div>';
}

function focusRecommendedOnMap() {
  if (!leafletMap || !state.results.length) return;
  const markers = state.results.map(place => leafletMarkerByPlace.get(place.id)).filter(Boolean);
  if (!markers.length) return;
  if (markers.length === 1) {
    leafletMap.flyTo(markers[0].getLatLng(), Math.max(16, leafletMap.getZoom()), { duration: 0.55 });
    return;
  }
  leafletMap.fitBounds(L.featureGroup(markers).getBounds(), { padding: [35, 35], maxZoom: 16, animate: true });
}

function card(place, index) {
  const featured = place.featuredRecommendation;
  const categories = featured ? categoriesForText(featured.name) : categoriesOf(place);
  const tags = categories.slice(0, 3).map(type => `<span class="tag">${escapeHtml(type)}</span>`).join('');
  const matchedPreferences = categories.filter(type => state.types.has(type));
  const reasons = state.quickMode
    ? ['随机遇见', areaLabel(place.campusArea), mapKind(place) === 'canteen' ? '食堂／窗口' : '校内店铺']
    : [
      state.area !== 'all' ? areaLabel(place.campusArea) : null,
      state.placeType !== 'all' ? placeTypeLabel(mapKind(place)) : null,
      matchedPreferences.length ? `符合${matchedPreferences.join('、')}偏好` : null,
    ].filter(Boolean);
  const reason = reasons.length ? reasons.join(' · ') : '从当前可选地点中随机挑选';
  return `<article class="card">
    <div class="cardtop"><span class="zone pending">${escapeHtml(placeLabel(place))}</span><span class="score">${escapeHtml(place.verificationStatus || '待确认')}</span></div>
    <h3>${escapeHtml(place.name)}</h3>
    <p class="dish">${featured ? `推荐菜品：${escapeHtml(featured.name)}` : '可在详情中查看已收集的菜品与线索'}</p>
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    <div class="reason">推荐理由：${escapeHtml(reason)}</div>
    <div class="info">📍 ${escapeHtml(locationFor(place, featured))}<br>🕒 最近确认：${escapeHtml(place.lastConfirmedAt || '暂无确认记录')}</div>
    <div class="cardactions"><button class="secondary" data-detail="${escapeHtml(place.id)}">查看详情</button><button class="secondary" data-swap="${index}">换一家 ↻</button></div>
  </article>`;
}

function renderResults() {
  const container = $('#cards');
  $('#results-title').textContent = state.results.length
    ? `${state.results.length} 个觅食选择可以先看看`
    : '暂时没有匹配的觅食选择';
  if (!state.results.length) {
    container.innerHTML = '<div class="empty">没有匹配该菜名偏好的地点，请返回并放宽选择。</div>';
    return;
  }
  container.innerHTML = state.results.map(card).join('');
}

function swap(index) {
  const used = new Set(state.results.map(place => place.id));
  const next = shuffled(candidates(state.quickMode)).find(place => !used.has(place.id));
  if (!next) return toast('当前条件下没有更多候选地点');
  state.results[index] = chooseResult(next, state.quickMode);
  renderResults();
  renderHomeFeed();
  renderMap();
  toast('已为你换一家');
}

function feedbackStatusLabel(status) {
  return ({
    '待审核': '待处理',
    '已批准': '已采纳',
    '已驳回': '未采纳',
    pending: '待处理',
    approved: '已采纳',
    rejected: '未采纳',
  }[status] || status || '待处理');
}

function localFeedbacks() {
  try {
    const stored = JSON.parse(localStorage.getItem(feedbackStorageKey) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    console.warn('读取本地反馈失败：', error);
    return [];
  }
}

let reviewFilter = '待审核';
let selectedReviewCode = '';

function writeLocalFeedbacks(records) {
  localStorage.setItem(feedbackStorageKey, JSON.stringify(records.slice(0, 50)));
}

function renderReviewDetail(feedback) {
  const panel = $('#review-detail');
  if (!feedback) {
    panel.innerHTML = '<div class="empty">请从左侧选择一条反馈。</div>';
    return;
  }
  const place = state.places.find(item => item.id === feedback.placeId);
  const placeName = place?.name || feedback.proposedPlaceName || '新增地点';
  const reviewed = feedback.status !== '待审核';
  panel.innerHTML = `<span class="pill">${escapeHtml(feedbackStatusLabel(feedback.status))}</span><h2>${escapeHtml(placeName)}</h2>
    <div class="review-data"><div><b>反馈编号</b>${escapeHtml(feedback.trackingCode)}</div><div><b>反馈类型</b>${escapeHtml(feedback.feedbackType)}</div><div><b>提交时间</b>${escapeHtml(new Date(feedback.submittedAt).toLocaleString('zh-CN'))}</div><div><b>原地点</b>${escapeHtml(place?.locationNote || (feedback.placeId ? '地点信息待查看' : '无，新地点'))}</div></div>
    <div class="review-data"><div style="grid-column:1/-1"><b>用户说明</b><span class="review-evidence">${escapeHtml(feedback.details || '未填写补充说明')}</span></div></div>
    <label class="field"><span>处理说明</span><textarea id="review-note" class="review-note" maxlength="300" placeholder="说明采纳或驳回的依据。" ${reviewed ? 'disabled' : ''}>${escapeHtml(feedback.reviewNote || '')}</textarea></label>
    ${reviewed ? `<p class="notice">该反馈已经处理。如需修改结果，请在正式后台保留二次复核记录。</p>` : '<div class="review-actions"><button class="primary" data-review-action="approve">采纳反馈</button><button class="review-reject" data-review-action="reject">驳回反馈</button></div>'}`;
}

function renderReview() {
  const records = localFeedbacks();
  const visible = reviewFilter === 'all' ? records : records.filter(item => item.status === '待审核');
  $('#review-count').textContent = `${records.filter(item => item.status === '待审核').length} 条待处理`;
  $('#review-list').innerHTML = visible.length ? visible.map(item => {
    const place = state.places.find(placeItem => placeItem.id === item.placeId);
    const active = item.trackingCode === selectedReviewCode ? ' active' : '';
    const done = item.status === '待审核' ? '' : ' review-done';
    return `<button class="review-item${active}${done}" data-review-code="${escapeHtml(item.trackingCode)}"><b>${escapeHtml(place?.name || item.proposedPlaceName || '新增地点')}</b><em class="review-state">${escapeHtml(feedbackStatusLabel(item.status))}</em><span>${escapeHtml(item.feedbackType)} · ${escapeHtml(item.trackingCode)}</span></button>`;
  }).join('') : '<div class="empty">当前没有待处理反馈。可先从“反馈”页面提交一条演示数据。</div>';
  const selected = records.find(item => item.trackingCode === selectedReviewCode);
  renderReviewDetail(selected);
}

function decideFeedback(action) {
  if (!selectedReviewCode) return;
  const note = $('#review-note')?.value.trim() || '';
  if (!note) return toast('请先填写处理说明');
  const records = localFeedbacks();
  const feedback = records.find(item => item.trackingCode === selectedReviewCode);
  if (!feedback) return toast('未找到这条反馈');
  feedback.status = action === 'approve' ? '已批准' : '已驳回';
  feedback.reviewNote = note;
  feedback.reviewedAt = new Date().toISOString();
  writeLocalFeedbacks(records);
  renderReview();
  toast(action === 'approve' ? '已采纳，用户可凭编号查询结果' : '已驳回，用户可查看处理说明');
}

function createTrackingCode() {
  const date = new Date();
  const day = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 6).toUpperCase();
  return `FB-${day}-${suffix}`;
}

function saveLocalFeedback(payload) {
  const item = {
    trackingCode: createTrackingCode(),
    status: '待审核',
    submittedAt: new Date().toISOString(),
    reviewNote: '',
    ...payload,
  };
  const records = localFeedbacks();
  records.unshift(item);
  writeLocalFeedbacks(records);
  return item;
}

async function submitFeedback(payload) {
  try {
    const response = await fetch(new URL('./api/feedbacks', document.baseURI), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) return (await response.json()).feedback;
    if (![404, 405].includes(response.status)) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || '反馈提交失败');
    }
  } catch (error) {
    if (!/Failed to fetch|HTTP|404|405/i.test(error.message) && !location.hostname.endsWith('github.io')) throw error;
  }
  return saveLocalFeedback(payload);
}

async function findFeedback(trackingCode) {
  const normalized = trackingCode.trim().toUpperCase();
  try {
    const response = await fetch(new URL(`./api/feedbacks/${encodeURIComponent(normalized)}`, document.baseURI), { cache: 'no-store' });
    if (response.ok) return (await response.json()).feedback;
    if (response.status !== 404) throw new Error('暂时无法查询反馈');
  } catch (error) {
    if (!location.hostname.endsWith('github.io') && !/Failed to fetch|404/i.test(error.message)) throw error;
  }
  return localFeedbacks().find(item => item.trackingCode === normalized) ?? null;
}

function renderFeedbackResult(feedback) {
  if (!feedback) {
    $('#tracking-result').innerHTML = '<div class="empty">没有找到这个反馈编号，请检查后重试。</div>';
    return;
  }
  const place = state.places.find(item => item.id === feedback.placeId);
  $('#tracking-result').innerHTML = `<div class="feedback-receipt"><b>反馈编号：${escapeHtml(feedback.trackingCode)}</b><br>当前状态：${escapeHtml(feedbackStatusLabel(feedback.status))}<br>反馈对象：${escapeHtml(place?.name || feedback.proposedPlaceName || '新增地点')}<br>反馈类型：${escapeHtml(feedback.feedbackType)}<br>提交时间：${escapeHtml(new Date(feedback.submittedAt).toLocaleString('zh-CN'))}${feedback.reviewNote ? `<br>处理说明：${escapeHtml(feedback.reviewNote)}` : ''}</div>`;
}

function populateFeedbackPlaces() {
  const select = $('#feedback-place');
  if (!select) return;
  select.innerHTML = `<option value="">请选择反馈对象</option><option value="__new_place__">＋ 新地点（清单中没有）</option>${state.places.map(place => `<option value="${escapeHtml(place.id)}">${escapeHtml(place.name)}（${escapeHtml(placeLabel(place))}）</option>`).join('')}`;
}

function activateFeedbackTab(tab) {
  document.querySelectorAll('[data-feedback-tab]').forEach(button => {
    button.setAttribute('aria-selected', String(button.dataset.feedbackTab === tab));
  });
  $('#feedback-submit-pane').hidden = tab !== 'submit';
  $('#feedback-status-pane').hidden = tab !== 'status';
}

async function handleFeedbackSubmit(place, form, receiptSelector = '#feedback-receipt') {
  const data = new FormData(form);
  let feedbackType = String(data.get('feedbackType') || '其他');
  const details = String(data.get('details') || '').trim();
  const proposedPlaceName = String(data.get('proposedPlaceName') || '').trim();
  const selectedValue = place?.id || String(data.get('placeId') || '').trim() || null;
  const isNewPlace = selectedValue === '__new_place__' || feedbackType === '新增位置';
  if (isNewPlace) feedbackType = '新增位置';
  const selectedPlaceId = isNewPlace ? null : selectedValue;
  if (!details) return toast('请填写修改意见或补充说明');
  if (isNewPlace && !proposedPlaceName) return toast('请填写新增地点名称');
  if (!isNewPlace && !selectedPlaceId) return toast('请选择反馈对象，或选择“新地点”');
  const calibration = selectedPlaceId ? calibrationForPlace(selectedPlaceId) : null;
  const payload = {
    placeId: selectedPlaceId,
    proposedPlaceName: isNewPlace ? proposedPlaceName : null,
    feedbackType,
    details,
    proposedPayload: calibration ? { latitude: calibration.latitude, longitude: calibration.longitude } : null,
  };
  const button = form.querySelector('button[type="submit"]');
  const defaultText = button.textContent;
  button.disabled = true;
  button.textContent = '正在提交…';
  try {
    const feedback = await submitFeedback(payload);
    const receipt = $(receiptSelector);
    receipt.innerHTML = `<b>反馈已提交</b><br>反馈编号：<strong>${escapeHtml(feedback.trackingCode)}</strong><br>当前状态：${escapeHtml(feedbackStatusLabel(feedback.status))}<br><span class="small">请保存反馈编号，以便查询处理结果。</span><div class="feedback-actions"><button id="copy-tracking-code" class="secondary" type="button">复制编号</button><button id="open-feedback-status" class="secondary" type="button">查看处理状态</button></div>`;
    receipt.hidden = false;
    receipt.querySelector('#copy-tracking-code').onclick = async () => {
      await navigator.clipboard?.writeText(feedback.trackingCode);
      toast('反馈编号已复制');
    };
    receipt.querySelector('#open-feedback-status').onclick = () => {
      $('#tracking-code').value = feedback.trackingCode;
      renderFeedbackResult(feedback);
      activateFeedbackTab('status');
      go('feedback');
    };
    form.reset();
    form.querySelector('[data-proposed-name]').hidden = true;
    if (form.elements.placeId) form.elements.placeId.disabled = false;
  } catch (error) {
    toast(error.message || '反馈提交失败，请稍后重试');
  } finally {
    button.disabled = false;
    button.textContent = defaultText;
  }
}

function detail(id, from = 'results') {
  const place = state.places.find(item => item.id === id);
  if (!place) return toast('找不到这个觅食点');
  const featured = from === 'results' ? state.results.find(item => item.id === id)?.featuredRecommendation : null;
  const dishes = place.recommendations.map(item => `<li>${escapeHtml(dishLabel(item))}${item.note ? ` <span class="small">（${escapeHtml(item.note)}）</span>` : ''}</li>`).join('');
  $('#detailbox').innerHTML = `<div class="detailhero"><div><span class="zone pending">${escapeHtml(placeLabel(place))}</span><h2>${escapeHtml(place.name)}</h2>${featured ? `<p class="dish">本次推荐：${escapeHtml(featured.name)}</p>` : ''}</div><button id="feedback" class="primary">纠错反馈</button></div>
    <div class="details">
      <div class="detailitem"><b>位置线索</b><span>${escapeHtml(locationFor(place, featured))}<br><span class="small location-status">${escapeHtml(place.locationStatus || '未定位')}</span></span><button class="secondary map-location-button" data-locate="${escapeHtml(place.id)}">在地图上查看</button></div>
      <div class="detailitem"><b>午餐／晚餐营业时段</b><span>待确认</span></div>
      <div class="detailitem"><b>信息状态</b><span>${escapeHtml(place.verificationStatus || '待确认')}</span></div>
      <div class="detailitem"><b>最近确认</b><span>${escapeHtml(place.lastConfirmedAt || '暂无确认记录')}</span></div>
      <div class="detailitem"><b>来源分组</b><span>${escapeHtml(place.sourceGroup)}</span></div>
    </div>
    <div id="feedback-correction" class="notice feedback-correction" hidden><b>提交修改意见</b><p>反馈只会进入待处理记录，不会直接修改公开地点。位置反馈可先在地图上重新圈点。</p><form id="feedback-form" class="feedback-form">
      <label>反馈类型<select name="feedbackType"><option>位置有误</option><option>名称有误</option><option>楼层入口错误</option><option>菜品信息有误</option><option>营业时间有误</option><option>暂停营业</option><option>还在这里</option><option>新增位置</option><option>其他</option></select></label>
      <label data-proposed-name hidden>新增地点名称<input name="proposedPlaceName" maxlength="80" placeholder="请输入地点或店铺名称"></label>
      <label>修改意见或补充说明<textarea name="details" maxlength="500" required placeholder="请描述当前信息哪里不准确，以及建议如何修改"></textarea></label>
      <div class="feedback-actions"><button id="calibrate-place" class="secondary" type="button">在地图上重新圈位置</button><button class="primary" type="submit">提交修改意见</button></div>
    </form><div id="feedback-receipt" class="feedback-receipt" hidden></div></div>
    ${dishes ? `<div class="notice"><b>已收集的菜品／线索</b><ul>${dishes}</ul><span class="small">这些内容来自项目组清单，营业情况和位置仍需现场核实。</span></div>` : ''}`;
  $('#feedback').onclick = () => {
    const panel = $('#feedback-correction');
    panel.hidden = !panel.hidden;
  };
  $('#calibrate-place').onclick = () => startCalibrationForPlace(place.id);
  const feedbackForm = $('#feedback-form');
  feedbackForm.elements.feedbackType.onchange = event => {
    feedbackForm.querySelector('[data-proposed-name]').hidden = event.target.value !== '新增位置';
  };
  feedbackForm.onsubmit = event => {
    event.preventDefault();
    handleFeedbackSubmit(place, feedbackForm);
  };
  $('#detailbox [data-locate]').onclick = event => focusPlaceOnMap(event.currentTarget.dataset.locate);
  const back = $('#detail .back');
  const returnToMap = from === 'map';
  back.dataset.go = returnToMap ? 'home' : from;
  back.dataset.returnMap = String(returnToMap);
  back.textContent = from === 'admin' ? '← 返回全部地点' : returnToMap ? '← 返回首页地图' : '← 返回推荐结果';
  go('detail');
}

function renderAllPlaces() {
  const query = ($('#place-search')?.value || '').trim().toLocaleLowerCase();
  const filtered = state.places.filter(place => [
    place.name,
    place.locationNote,
    ...place.recommendations.map(item => item.name),
  ].some(value => String(value ?? '').toLocaleLowerCase().includes(query)));
  $('#count').textContent = `${filtered.length} / ${state.places.length} 个地点`;
  $('#adminlist').innerHTML = filtered.length
    ? filtered.map(place => `<div class="adminrow"><span class="zone pending">${escapeHtml(place.sourceGroup)}</span><strong>${escapeHtml(place.name)}${place.recommendations.length ? `<small>${escapeHtml(dishesOf(place))}</small>` : ''}</strong><button class="secondary" style="flex:none" data-detail="${escapeHtml(place.id)}">详情</button></div>`).join('')
    : '<div class="empty">没有找到相关地点或菜品。</div>';
}

function setupPage() {
  $('#place-search').addEventListener('input', renderAllPlaces);
  $('#map-search').addEventListener('input', renderMap);
  $('#calibration-target').addEventListener('change', event => {
    state.calibrationTargetId = event.target.value;
    renderCalibrationPanel();
    focusCalibrationTarget();
  });
  $('#calibration-undo').addEventListener('click', () => {
    state.calibrations = state.calibrations.filter(item => item.targetId !== state.calibrationTargetId);
    saveCalibrationDraft();
    renderMap();
    renderCalibrationPanel();
    focusCalibrationTarget();
    toast('已撤销当前地点的校准草稿');
  });
  $('#calibration-copy').addEventListener('click', copyCalibrationResult);
  $('#calibration-download').addEventListener('click', downloadCalibrationResult);
  $('#calibration-close').addEventListener('click', stopCalibration);
  $('#calibration-clear').addEventListener('click', () => {
    if (!confirm('确定清空当前浏览器中的全部校准草稿吗？')) return;
    state.calibrations = [];
    saveCalibrationDraft();
    renderMap();
    renderCalibrationPanel();
    focusCalibrationTarget();
    toast('全部校准草稿已清空');
  });
  $('#map-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-map-type]');
    if (!button) return;
    state.mapType = button.dataset.mapType;
    document.querySelectorAll('#map-filters [data-map-type]').forEach(item => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    renderMap();
  });
  $('#campus-map').addEventListener('click', event => {
    const detailButton = event.target.closest('[data-map-detail]');
    if (detailButton) detail(detailButton.dataset.mapDetail, 'map');
  });

  document.querySelectorAll('[data-go]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.returnMap === 'true') scrollToMap();
      else go(button.dataset.go);
    });
  });
  document.querySelectorAll('[data-scroll-map]').forEach(button => {
    button.addEventListener('click', () => scrollToMap());
  });
  $('#meal').addEventListener('click', event => {
    const button = event.target.closest('[data-v]');
    if (!button) return;
    state.meal = button.dataset.v;
    updateMealButtons();
  });
  updateMealButtons();
  $('#area-filter').addEventListener('click', event => {
    const button = event.target.closest('[data-v]');
    if (!button) return;
    state.area = button.dataset.v;
    document.querySelectorAll('#area-filter [data-v]').forEach(item => {
      item.setAttribute('aria-pressed', String(item === button));
    });
  });
  $('#place-type-filter').addEventListener('click', event => {
    const button = event.target.closest('[data-v]');
    if (!button) return;
    state.placeType = button.dataset.v;
    document.querySelectorAll('#place-type-filter [data-v]').forEach(item => {
      item.setAttribute('aria-pressed', String(item === button));
    });
  });
  $('#types').addEventListener('click', event => {
    const button = event.target.closest('[data-v]');
    if (!button) return;
    if (state.types.has(button.dataset.v)) state.types.delete(button.dataset.v);
    else state.types.add(button.dataset.v);
    button.setAttribute('aria-pressed', String(state.types.has(button.dataset.v)));
  });
  $('#quick').addEventListener('click', () => recommend(true));
  $('#recommend').addEventListener('click', () => recommend(false));
  document.querySelectorAll('[data-decision-tab]').forEach(button => {
    button.addEventListener('click', () => setDecisionTab(button.dataset.decisionTab));
  });
  $('#home-feed-list').addEventListener('click', event => {
    const card = event.target.closest('[data-home-focus]');
    if (card) focusPlaceOnMap(card.dataset.homeFocus, { scroll: false });
  });
  $('#cards').addEventListener('click', event => {
    const detailButton = event.target.closest('[data-detail]');
    const swapButton = event.target.closest('[data-swap]');
    if (detailButton) detail(detailButton.dataset.detail);
    if (swapButton) swap(Number(swapButton.dataset.swap));
  });
  $('#adminlist').addEventListener('click', event => {
    const button = event.target.closest('[data-detail]');
    if (button) detail(button.dataset.detail, 'admin');
  });
  $('#review').addEventListener('click', event => {
    const filterButton = event.target.closest('[data-review-filter]');
    const recordButton = event.target.closest('[data-review-code]');
    const actionButton = event.target.closest('[data-review-action]');
    if (filterButton) {
      reviewFilter = filterButton.dataset.reviewFilter;
      document.querySelectorAll('[data-review-filter]').forEach(button => button.setAttribute('aria-pressed', String(button === filterButton)));
      renderReview();
    }
    if (recordButton) {
      selectedReviewCode = recordButton.dataset.reviewCode;
      renderReview();
    }
    if (actionButton) decideFeedback(actionButton.dataset.reviewAction);
  });
  $('#tracking-form').addEventListener('submit', async event => {
    event.preventDefault();
    const code = $('#tracking-code').value.trim();
    if (!code) return;
    $('#tracking-result').innerHTML = '<div class="empty">正在查询…</div>';
    try {
      renderFeedbackResult(await findFeedback(code));
    } catch (error) {
      $('#tracking-result').innerHTML = `<div class="empty">${escapeHtml(error.message || '查询失败，请稍后重试')}</div>`;
    }
  });
  document.querySelectorAll('[data-feedback-tab]').forEach(button => {
    button.addEventListener('click', () => activateFeedbackTab(button.dataset.feedbackTab));
  });
  $('#feedback-page-form').addEventListener('submit', event => {
    event.preventDefault();
    handleFeedbackSubmit(null, event.currentTarget, '#feedback-page-receipt');
  });
  $('#feedback-page-form').elements.feedbackType.addEventListener('change', event => {
    const isNew = event.target.value === '新增位置';
    const form = event.currentTarget.form;
    form.querySelector('[data-proposed-name]').hidden = !isNew;
    if (isNew) form.elements.placeId.value = '__new_place__';
    else if (form.elements.placeId.value === '__new_place__') form.elements.placeId.value = '';
  });
  $('#feedback-page-form').elements.placeId.addEventListener('change', event => {
    const form = event.currentTarget.form;
    const isNew = event.target.value === '__new_place__';
    form.querySelector('[data-proposed-name]').hidden = !isNew;
    if (isNew) form.elements.feedbackType.value = '新增位置';
    else if (form.elements.feedbackType.value === '新增位置') form.elements.feedbackType.value = '位置有误';
  });
}

setupPage();
const initialView = location.hash.slice(1);
if (initialView === 'map') scrollToMap('auto');
else if (['home', 'admin', 'feedback', 'review'].includes(initialView)) go(initialView, { updateHistory: false });
window.addEventListener('popstate', () => {
  const view = location.hash.slice(1);
  if (view === 'map') scrollToMap('auto');
  else go(['home', 'results', 'detail', 'admin', 'feedback', 'review'].includes(view) ? view : 'home', { updateHistory: false });
});
loadPlaces();
