// Emblème « 33 » : un sceau à engrenage (clin d'œil aux Arts et Métiers),
// dessiné en SVG. Les couleurs viennent de la feuille de style.
const NS = 'http://www.w3.org/2000/svg';

export function gearPath(cx, cy, teeth, rOuter, rInner) {
  const step = (Math.PI * 2) / teeth;
  const points = [];
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step - Math.PI / 2;
    points.push([rInner, a - step * 0.5], [rInner, a - step * 0.24], [rOuter, a - step * 0.15],
      [rOuter, a + step * 0.15], [rInner, a + step * 0.24]);
  }
  return `M${points.map(([r, a]) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`).join('L')}Z`;
}

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function emblem({ size = 44, title = null, className = '' } = {}) {
  const root = svg('svg', {
    viewBox: '0 0 100 100', width: size, height: size,
    class: ['emblem', className].filter(Boolean).join(' '),
  });
  if (title) {
    root.setAttribute('role', 'img');
    const t = svg('title');
    t.textContent = title;
    root.append(t);
  } else {
    root.setAttribute('aria-hidden', 'true');
  }
  root.append(
    svg('path', { d: gearPath(50, 50, 24, 49, 43.5), class: 'emblem__gear' }),
    svg('circle', { cx: 50, cy: 50, r: 40, class: 'emblem__disc' }),
    svg('circle', { cx: 50, cy: 50, r: 36, class: 'emblem__ring' }),
  );
  const text = svg('text', { x: 50, y: 66, 'text-anchor': 'middle', class: 'emblem__text' });
  text.textContent = '33';
  root.append(text);
  // Deux losanges gravés, de part et d'autre
  for (const x of [19, 81]) {
    root.append(svg('path', { d: `M${x} 46.5L${x + 3.5} 50L${x} 53.5L${x - 3.5} 50Z`, class: 'emblem__mark' }));
  }
  return root;
}
