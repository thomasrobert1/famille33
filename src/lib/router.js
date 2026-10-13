// Routeur par ancre (#/…) : compatible avec GitHub Pages sans configuration serveur.
const routes = [];
let listener = null;

export function route(pattern, view, options = {}) {
  const keys = [];
  const source = pattern.replace(/:(\w+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  routes.push({ pattern, regex: new RegExp(`^${source}/?$`), keys, view, ...options });
}

export function currentPath() {
  return decodeURI(location.hash.replace(/^#/, '')) || '/';
}

export function resolve(path) {
  const [pathname, search] = path.split('?');
  for (const r of routes) {
    const m = r.regex.exec(pathname);
    if (m) {
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { ...r, params, query: new URLSearchParams(search ?? ''), path };
    }
  }
  return null;
}

export function navigate(path, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', `#${path}`);
    listener?.();
  } else if (currentPath() === path) {
    listener?.();
  } else {
    location.hash = path;
  }
}

export function startRouter(onChange) {
  listener = onChange;
  window.addEventListener('hashchange', onChange);
  onChange();
}
