// Petit utilitaire de création d'éléments DOM. Les textes sont toujours
// insérés comme nœuds texte : aucune donnée utilisateur ne passe par innerHTML.
// Les méthodes natives append / prepend / replaceChildren convertissent null en
// texte « null ». On les rend tolérantes une fois pour toutes, ce qui permet
// d'écrire « condition ? élément : null » dans toutes les vues.
const keep = (node) => node !== null && node !== undefined && node !== false;
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const method of ['append', 'prepend', 'replaceChildren']) {
    const native = proto[method];
    if (native.f33Patched) continue;
    const patched = function patched(...nodes) { return native.apply(this, nodes.filter(keep)); };
    patched.f33Patched = true;
    proto[method] = patched;
  }
}

const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'hidden', 'required', 'multiple',
  'readOnly', 'indeterminate', 'open', 'defaultValue', 'defaultChecked']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') {
        el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
      } else if (key === 'style' && typeof value === 'object') {
        for (const [prop, v] of Object.entries(value)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, v);
          else el.style[prop] = v;
        }
      } else if (key === 'dataset') {
        Object.assign(el.dataset, value);
      } else if (key === 'trustedHtml') {
        // Réservé au rendu Markdown (src/lib/markdown.js), qui échappe tout le texte.
        el.innerHTML = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (PROPS.has(key)) {
        el[key] = value;
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function replace(el, ...children) {
  clear(el);
  return append(el, children);
}

let uid = 0;
export function uniqueId(prefix = 'f33') {
  uid += 1;
  return `${prefix}-${uid}`;
}
