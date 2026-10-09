const iconPaths = {
  plus: ['M12 5v14', 'M5 12h14'], minus: ['M5 12h14'], close: ['m6 6 12 12', 'M6 18 18 6'],
  copy: ['M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4', 'M9 3h8l4 4v8H9z', 'M17 3v4h4'],
  mail: ['M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z', 'm3 6 9 7 9-7'],
  open: ['M13 4h7v7', 'm20 4-11 11', 'M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5'],
  edit: ['m16 3 5 5-12 12-6 1 1-6Z', 'm14 5 5 5'], more: [],
  globe: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M3 12h18', 'M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z'],
  folder: ['M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z', 'M3 10h18'],
  search: ['M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z', 'm15 15 6 6'],
  settings: ['m9 3-1 3-3 1-2 3 2 2v3l2 3 3-1 2 2 3-1 1-3 3-1 2-3-2-2v-3l-2-3-3 1-2-2Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  database: ['M21 6c0 2-4 3-9 3S3 8 3 6s4-3 9-3 9 1 9 3Z', 'M3 6v12c0 2 4 3 9 3s9-1 9-3V6', 'M3 12c0 2 4 3 9 3s9-1 9-3'],
  cloud: ['M7 18H6a4 4 0 0 1-1-8 7 7 0 0 1 14-1 4.5 4.5 0 0 1 0 9H7Z'],
  info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 11v6', 'M12 7h.01'],
  user: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M4 21v-2a8 8 0 0 1 16 0v2Z'],
  chevron: ['m6 9 6 6 6-6'], play: ['m8 5 11 7-11 7Z']
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('ui-icon');
  for (const d of iconPaths[name] || iconPaths.globe) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path); }
  if (name === 'more') for (const cy of [5, 12, 19]) { const circle = document.createElementNS(svg.namespaceURI, 'circle'); circle.setAttribute('cx', '12'); circle.setAttribute('cy', cy); circle.setAttribute('r', '1'); circle.setAttribute('fill', 'currentColor'); svg.append(circle); }
  return svg;
}
function colorIndex(value) { return Array.from(value).reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 0) % 5; }
function siteMark(site, compact = false) {
  const host = new URL(site.url).hostname;
  const mark = document.createElement('span'); mark.className = `site-mark ${compact ? 'compact' : ''} site-color-${colorIndex(host)}`;
  const known = host === 'jimeng.jianying.com' ? 'jimeng' : host === 'dreamina.capcut.com' ? 'dreamina' : null;
  if (!known) { mark.append(icon('globe')); return mark; }
  mark.classList.add(known);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 40 40'); svg.setAttribute('aria-hidden', 'true');
  const shapes = known === 'jimeng' ? [ ['M7 28 16 9l4 12Z', '#5ce6e4'], ['m16 9 17 8-13 4Z', '#5774ff'], ['m20 21 9 10-2-12Z', '#b49aff'] ] : [ ['m11 7 18 6 4 7-8 12-12 1 7-12Z', '#29d3d5'], ['m11 7 9 14-7 12 3-15Z', '#168bcb'], ['m20 14 8 6-8 5 3-6Z', '#071b32'] ];
  shapes.forEach(([d, fill]) => { const p = document.createElementNS(svg.namespaceURI, 'path'); p.setAttribute('d', d); p.setAttribute('fill', fill); svg.append(p); }); mark.append(svg); return mark;
}
function brandMark() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 48 48'); svg.setAttribute('aria-hidden', 'true');
  [['M45 24A21 21 0 1 1 3 24a21 21 0 0 1 42 0Z','#2867ff'],['M4 30c9-12 15-17 22-12 4 3 7 4 17-1v8c-10 6-15 5-20 1-5-3-9 0-17 10Z','#fff'],['M5 16c8-7 15-8 21-3-6-1-9 2-12 7Z','#83c4ff']].forEach(([d,fill])=>{const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);p.setAttribute('fill',fill);svg.append(p);}); return svg;
}
function decorate(el, name, text) { el.replaceChildren(icon(name)); if (text) { const span = document.createElement('span'); span.textContent = text; el.append(span); } }
