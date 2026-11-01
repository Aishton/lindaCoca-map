// 首页优先读取本地 API；GitHub Pages 没有 Node 服务时读取仓库内的公开种子数据。
const state = {
  places: [],
  meal: new Date().getHours() >= 10 && new Date().getHours() < 15 ? 'lunch' : 'dinner',
  types: new Set(),
  results: [],
  source: '',
  quickMode: false,
  mapType: 'all',
  selectedMapPlaceId: null,
};

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
      priceLevel: null,
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
    campusArea: null,
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
      $('#home .head > .small').textContent = '数据加载失败';
      $('#adminlist').textContent = '数据加载失败，请通过本地服务或 GitHub Pages 打开网页后重试。';
      toast('觅食点加载失败，请刷新页面重试');
      return;
    }
  }

  $('#home .head > .small').textContent = `已收集 ${state.places.length} 个地点 · ${state.source}`;
  $('#count').textContent = `${state.places.length} 个地点`;
  renderAllPlaces();
  renderMap();
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2300);
}

function go(view, { resetScroll = true } = {}) {
  document.querySelectorAll('.view').forEach(element => {
    element.classList.toggle('active', element.id === view);
  });
  if (view === 'admin') renderAllPlaces();
  if (view === 'home') {
    renderMap();
    setTimeout(() => leafletMap?.invalidateSize(), 0);
  }
  if (resetScroll) scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToMap(behavior = 'smooth') {
  go('home', { resetScroll: false });
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
  return place.placeType === 'canteen' ? 'canteen' : 'shop';
}

function mapGroups() {
  const groups = new Map();
  for (const place of state.places) {
    if (place.longitude === null || place.latitude === null) continue;
    const key = `${place.longitude.toFixed(5)}:${place.latitude.toFixed(5)}`;
    const group = groups.get(key) ?? {
      longitude: place.longitude,
      latitude: place.latitude,
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
  setTimeout(() => container.classList.add('is-ready'), 1800);
  return true;
}

function markerIcon(group) {
  const primary = group.places.find(place => place.placeType === 'canteen') ?? group.places[0];
  const approximate = group.places.some(place => place.locationStatus !== '已确认');
  const selected = group.places.some(place => place.id === state.selectedMapPlaceId);
  return L.divIcon({
    className: 'food-map-icon',
    html: `<span class="geo-marker ${mapKind(primary) === 'shop' ? 'shop' : ''} ${approximate ? 'approximate' : ''} ${selected ? 'selected' : ''}"><span>${group.places.length > 1 ? group.places.length : '•'}</span></span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -34],
  });
}

function mapPopupContent(places) {
  const first = places[0];
  const parent = places.find(place => place.placeType === 'food_court');
  const sharedLocation = places.every(place => place.locationNote && place.locationNote === first.locationNote)
    ? first.locationNote
    : null;
  const groupTitle = parent?.name || sharedLocation || first.name;
  const source = first.coordinateSource ? `<p>坐标来源：${escapeHtml(first.coordinateSource)}</p>` : '';
  return `<h3>${escapeHtml(groupTitle)}</h3><p>${escapeHtml(places.map(place => place.name).join(' · '))}</p><p><span class="location-status">${escapeHtml(first.locationStatus)}</span>${first.locationNote && first.locationNote !== groupTitle ? ` · ${escapeHtml(first.locationNote)}` : ''}</p>${source}${places.map(place => `<button class="secondary" data-map-detail="${escapeHtml(place.id)}">查看${escapeHtml(place.name)}详情</button>`).join('')}`;
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

function focusPlaceOnMap(id) {
  const original = state.places.find(place => place.id === id);
  if (!original) return;
  const place = original.parentId ? state.places.find(item => item.id === original.parentId) ?? original : original;
  state.mapType = 'all';
  $('#map-search').value = '';
  document.querySelectorAll('#map-filters [data-map-type]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mapType === 'all'));
  });
  scrollToMap();
  setTimeout(() => {
    const marker = leafletMarkerByPlace.get(place.id) ?? leafletMarkerByPlace.get(original.id);
    if (!marker) return;
    leafletMap.flyTo(marker.getLatLng(), Math.max(17, leafletMap.getZoom()), { duration: 0.65 });
    showMapPopup([place.id, original.id]);
  }, 180);
}

function updateMealButtons() {
  document.querySelectorAll('#meal [data-v]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.v === state.meal));
  });
}

function candidates(quick) {
  if (quick || state.types.size === 0) return [...state.places];
  return state.places.filter(place => categoriesOf(place).some(type => state.types.has(type)));
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
    : '按菜名关键词粗略筛选后随机挑选；午餐／晚餐仅作场景标记，营业时段待核实。';
  $('#meta').textContent = `${mealLabel()}想吃什么 · ${state.source}`;
  renderResults();
  go('results');
}

function card(place, index) {
  const featured = place.featuredRecommendation;
  const title = featured?.name || place.name;
  const categories = featured ? categoriesForText(featured.name) : categoriesOf(place);
  const tags = categories.slice(0, 3).map(type => `<span class="tag">${escapeHtml(type)}</span>`).join('');
  return `<article class="card">
    <div class="cardtop"><span class="zone pending">${escapeHtml(placeLabel(place))}</span><span class="score">${escapeHtml(place.verificationStatus || '待确认')}</span></div>
    <h3>${escapeHtml(title)}</h3>
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    <div class="info">📍 ${escapeHtml(locationFor(place, featured))}<br>🕒 最近确认：${escapeHtml(place.lastConfirmedAt || '暂无确认记录')}</div>
    <div class="cardactions"><button class="secondary" data-detail="${escapeHtml(place.id)}">查看详情</button><button class="secondary" data-swap="${index}">换一家 ↻</button></div>
  </article>`;
}

function renderResults() {
  const container = $('#cards');
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
  toast('已为你换一家');
}

function detail(id, from = 'results') {
  const place = state.places.find(item => item.id === id);
  if (!place) return toast('找不到这个觅食点');
  const featured = from === 'results' ? state.results.find(item => item.id === id)?.featuredRecommendation : null;
  const dishes = place.recommendations.map(item => `<li>${escapeHtml(dishLabel(item))}${item.note ? ` <span class="small">（${escapeHtml(item.note)}）</span>` : ''}</li>`).join('');
  $('#detailbox').innerHTML = `<div class="detailhero"><div><span class="zone pending">${escapeHtml(placeLabel(place))}</span><h2>${escapeHtml(place.name)}</h2>${featured ? `<p class="dish">本次推荐：${escapeHtml(featured.name)}</p>` : ''}</div><button id="feedback" class="primary">纠错反馈</button></div>
    <div class="details">
      <div class="detailitem"><b>位置线索</b><span>${escapeHtml(locationFor(place, featured))}<br><span class="small location-status">${escapeHtml(place.locationStatus || '未定位')}</span></span><button class="secondary map-location-button" data-locate="${escapeHtml(place.id)}">在地图上查看</button></div>
      <div class="detailitem"><b>价格</b><span>待确认</span></div>
      <div class="detailitem"><b>午餐／晚餐营业时段</b><span>待确认</span></div>
      <div class="detailitem"><b>信息状态</b><span>${escapeHtml(place.verificationStatus || '待确认')}</span></div>
      <div class="detailitem"><b>最近确认</b><span>${escapeHtml(place.lastConfirmedAt || '暂无确认记录')}</span></div>
      <div class="detailitem"><b>来源分组</b><span>${escapeHtml(place.sourceGroup)}</span></div>
    </div>
    ${dishes ? `<div class="notice"><b>已收集的菜品／线索</b><ul>${dishes}</ul><span class="small">这些内容来自项目组清单，营业情况、位置和价格仍需现场核实。</span></div>` : ''}`;
  $('#feedback').onclick = () => toast('反馈提交功能尚未接入，请先联系项目组');
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
  $('#types').addEventListener('click', event => {
    const button = event.target.closest('[data-v]');
    if (!button) return;
    if (state.types.has(button.dataset.v)) state.types.delete(button.dataset.v);
    else state.types.add(button.dataset.v);
    button.setAttribute('aria-pressed', String(state.types.has(button.dataset.v)));
  });
  $('#quick').addEventListener('click', () => recommend(true));
  $('#recommend').addEventListener('click', () => recommend(false));
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
}

setupPage();
const initialView = location.hash.slice(1);
if (initialView === 'map') scrollToMap('auto');
else if (['home', 'admin'].includes(initialView)) go(initialView);
loadPlaces();
