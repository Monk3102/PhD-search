import { Config } from './config.js';
import { Utils } from './utils.js';
import { App } from './app.js';
import { Drawer } from './drawer.js';

export const MapModule = {
  map: null,
  markerLayer: null,
  baseTile: null,
  overlayTile: null,
  markerById: new Map(),
  selected: null,

  init() {
    this.map = L.map('map', { center: [50.8, 11.5], zoom: 4, minZoom: 3, maxZoom: 18, preferCanvas: true });
    this.setLayer('street');
    this.markerLayer = L.layerGroup().addTo(this.map);

    document.querySelectorAll('.map-style-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.map-style-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.setLayer(btn.dataset.style);
      });
    });
  },

  setLayer(style) {
    const cfg = Config.mapLayers[style];
    if (!cfg) return;
    if (this.baseTile) this.map.removeLayer(this.baseTile);
    if (this.overlayTile) this.map.removeLayer(this.overlayTile);
    this.baseTile = L.tileLayer(cfg.base, { maxZoom: 19, attribution: cfg.attr }).addTo(this.map);
    this.overlayTile = cfg.overlay ? L.tileLayer(cfg.overlay, { maxZoom: 19 }).addTo(this.map) : null;
  },

  renderMarkers(records, tab) {
    this.markerLayer.clearLayers();
    this.markerById.clear();
    this.selected = null;
    const fillColor = Config.markerColors[tab] || '#2563eb';
    const groups = {};

    records.forEach((r) => {
      const uni = Utils.getUniversity(r);
      if (!uni || uni.lat == null || uni.lng == null) return;
      const key = `${uni.lat.toFixed(4)},${uni.lng.toFixed(4)}`;
      (groups[key] = groups[key] || { lat: uni.lat, lng: uni.lng, uni, items: [] }).items.push(r);
    });

    Object.values(groups).forEach((g) => {
      const marker = L.circleMarker([g.lat, g.lng], {
        radius: Math.min(16, 7 + Math.log2(g.items.length + 1) * 3),
        fillColor,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      });
      const items = g.items;
      const popupMax = Math.min(300, Math.max(200, window.innerWidth - 48));
      marker.bindPopup(() => this.buildPopup(g, tab), {
        minWidth: Math.min(210, popupMax),
        maxWidth: popupMax,
      });
      marker.on('click', () => {
        if (items.length === 1) Drawer.open(items[0]);
      });
      items.forEach((item) => this.markerById.set(item.id, marker));
      marker.addTo(this.markerLayer);
    });
  },

  buildPopup(g, tab) {
    const nameOf = (r) => r.title || r.name || '';
    const items = g.items.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const el = document.createElement('div');
    el.style.cssText = 'font-size:12px;line-height:1.4';
    el.innerHTML = `
      <strong style="font-size:13px;color:#0f172a">${Utils.escape(g.uni.name)}</strong>
      <div style="color:#64748b;font-size:11px">${g.uni.city ? Utils.escape(g.uni.city) + ', ' : ''}${Utils.escape(g.uni.country)}</div>
      <div style="margin-top:6px;font-weight:600;color:#1d4ed8">${items.length} ${tab.slice(0, -1)}${items.length === 1 ? '' : 's'} here${items.length > 1 ? ' · pick one:' : ''}</div>`;
    if (!(tab === 'universities' && items.length === 1)) {
      const list = document.createElement('div');
      list.className = 'pin-list';
      items.forEach((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pin-item';
        b.textContent = (Utils.isNew(item) ? '✨ ' : '') + nameOf(item);
        b.addEventListener('click', () => Drawer.open(item));
        list.appendChild(b);
      });
      el.appendChild(list);
    }
    return el;
  },

  // Fly to the pin of a record and highlight it
  focus(record) {
    if (!this.map || App.activeTab === 'tracker') return;
    const uni = Utils.getUniversity(record);
    if (!uni || uni.lat == null || uni.lng == null) return;
    this.clearHighlight();
    const marker = this.markerById.get(record.id);
    if (marker) {
      marker.setStyle({ color: '#facc15', weight: 4 });
      marker.bringToFront();
      this.selected = marker;
    }
    this.map.flyTo([uni.lat, uni.lng], Math.max(this.map.getZoom(), 6), { duration: 0.6 });
  },

  clearHighlight() {
    if (this.selected) this.selected.setStyle({ color: '#ffffff', weight: 2 });
    this.selected = null;
  },
};
