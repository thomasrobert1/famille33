// FAUX client Supabase, en mémoire, pour les tests d'interface uniquement.
// Il n'applique AUCUNE règle de sécurité : celles-ci sont testées sur la vraie
// base par tests/sql/rls_test.sql. Les données ci-dessous sont des données de test.
const uid = () => crypto.randomUUID();
const now = Date.now();
const ago = (days, hours = 0) => new Date(now - days * 86400000 - hours * 3600000).toISOString();
const year = new Date().getFullYear();
const d = (m, day, y = year) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// Auteurs de démonstration : prénom, nom, numéro, promotion, bucque
const authors = [
  ['Camille', 'Arnaud', 33, 225, 'Tourne-Broche', 'Safran', 'Ingénieure méthodes', 'Actif', 'Melun', 'Île-de-France', 'France', 'camille.arnaud@exemple.fr', true],
  ['Hugo', 'Bellec', 67, 225, 'Fend-la-Bise', 'EDF', 'Chef de projet', 'Actif', 'Reims', 'Grand Est', 'France', null, false],
  ['Inès', 'Carrel', 133, 225, 'Perce-Neige', null, null, 'Étudiant', 'Lille', 'Hauts-de-France', 'France', null, false],
  ['Bernard', 'Delorme', 33, 198, 'Vieux-Chêne', null, 'Ancien directeur d’usine', 'Retraité', 'Angers', 'Pays de la Loire', 'France', 'b.delorme@exemple.fr', true],
  ['Jacques', 'Ferrand', 67, 171, 'Grand-Mât', null, 'Conseil en industrialisation', 'Indépendant', 'Genève', null, 'Suisse', null, false],
  ['Louise', 'Garnier', 33, 224, 'Belle-Lame', 'Alstom', 'Ingénieure qualité', 'Actif', 'Toulouse', 'Occitanie', 'France', null, false],
];
const author = (i) => {
  const [first, last, number, promo, bucque, company, job, status, city, region, country, email, show] = authors[i];
  return {
    author_first_name: first, author_last_name: last, author_number: number, author_promo: promo,
    author_bucque: bucque, author_company: company, author_job: job, author_status: status,
    author_city: city, author_region: region, author_country: country, author_sector: null,
    author_note: null, author_email: email, show_contact: show,
  };
};
const db = {
  admins: [{ id: 'u-master', identifier: 'master33', display_name: 'Administration', last_login_at: ago(1) }],
  site_settings: [
    ['site.name', 'Famille 33'], ['site.tagline', 'Tradition, transmission, camaraderie'],
    ['site.intro', 'Cet espace rassemble les nouvelles, les souvenirs et les rendez-vous de la Famille 33 des Arts et Métiers. Chacun peut y déposer un article en se présentant.'],
    ['privacy.contact', ''], ['nav.labels', { feed: 'Fil', gallery: 'Galerie', planning: 'Planning' }],
    ['posts.open', true], ['posts.require_approval', true], ['posts.page_size', 10],
    ['comments.enabled', true], ['photos.open', true], ['photos.require_approval', true],
    ['events.open', true], ['events.require_approval', true],
    ['limits.posts_per_hour', 30], ['limits.comments_per_hour', 120], ['limits.photos_per_hour', 200],
    ['limits.events_per_hour', 30], ['limits.uploads_per_hour', 400],
    ['form.options', {
      regions: ['Bretagne', 'Grand Est', 'Hauts-de-France', 'Île-de-France', 'Occitanie', 'Pays de la Loire'],
      countries: ['France', 'Belgique', 'Canada', 'Suisse', 'Autre'],
      statuses: ['Étudiant', 'Actif', 'Entrepreneur', 'Indépendant', 'Retraité', 'Autre'],
      sectors: ['Aéronautique et spatial', 'Énergie', 'Industrie', 'Numérique', 'Autre'],
    }],
  ].map(([key, value]) => ({ key, value })),
  post_categories: [{ id: 'pc1', name: 'Nouvelles', sort_order: 10 }, { id: 'pc2', name: 'Carrières', sort_order: 20 }, { id: 'pc3', name: 'Souvenirs', sort_order: 30 }],
  event_categories: [
    ['ec1', 'Réunion de famille', '#6D1A2A', 'users'], ['ec2', 'Tradition', '#8A6A2E', 'landmark'],
    ['ec3', 'Repas et soirée', '#14213A', 'utensils'], ['ec4', 'Sortie', '#2F5D50', 'mountain'],
    ['ec5', 'Vie professionnelle', '#4A4E69', 'briefcase'],
  ].map(([id, name, color, icon], i) => ({ id, name, color, icon, description: null, sort_order: i * 10, is_active: true })),
  recurrence_options: [['week', 1, 'Chaque semaine'], ['week', 2, 'Toutes les 2 semaines'], ['month', 1, 'Chaque mois'], ['year', 1, 'Chaque année']]
    .map(([unit, interval_count, label], i) => ({ id: `ro${i}`, unit, interval_count, label, sort_order: i, is_active: true })),
  albums: [{ id: 'al1', name: 'Promotion 225', description: null, sort_order: 0 }, { id: 'al2', name: 'Archives', description: 'Photos anciennes numérisées', sort_order: 10 }],
  events: [],
  event_overrides: [],
  posts: [],
  comments: [],
  photos: [],
  audit_logs: [
    { id: 1, actor: 'master33', action: 'update', entity: 'posts', entity_id: 'p1', details: { label: 'Retour sur le dîner de famille', fields: ['status'] }, created_at: ago(2) },
    { id: 2, actor: 'master33', action: 'update', entity: 'event_categories', entity_id: 'ec4', details: { label: 'Sortie', fields: ['color'] }, created_at: ago(3) },
  ],
};
const ev = (id, title, cat, start, end, extra = {}) => db.events.push({
  id, title, category_id: cat, start_date: start, end_date: end, start_time: null, end_time: null, description: null,
  location: null, organizer: null, link: null, recurrence_unit: null, recurrence_interval: null, recurrence_until: null,
  status: 'published', created_at: ago(20), updated_at: ago(20),
  author_first_name: 'Camille', author_last_name: 'Arnaud', author_number: 33, author_promo: 225, author_bucque: 'Tourne-Broche',
  ...extra,
});
ev('e1', 'Dîner de la Famille 33', 'ec3', d(3, 14), d(3, 14), { start_time: '19:30:00', end_time: '23:30:00', location: 'Châlons-en-Champagne', recurrence_unit: 'year', recurrence_interval: 1, description: 'Le rendez-vous annuel de toutes les promotions.\n\nInscription auprès de l’organisateur avant fin février.', organizer: 'Hugo Bellec, Fend-la-Bise', author_first_name: 'Hugo', author_last_name: 'Bellec', author_number: 67, author_promo: 225, author_bucque: 'Fend-la-Bise' });
ev('e2', 'Week-end dans les Vosges', 'ec4', d(6, 6), d(6, 8), { location: 'Gérardmer' });
ev('e3', 'Remise des diplômes', 'ec2', d(9, 26), d(9, 26), { start_time: '15:00:00' });
ev('e4', 'Visite de l’usine Safran', 'ec5', d(5, 21), d(5, 21), { start_time: '14:00:00', end_time: '17:00:00' });
ev('e5', 'Réunion des cousins', 'ec1', d(1, 10), d(1, 10), { recurrence_unit: 'month', recurrence_interval: 2, start_time: '20:00:00', location: 'En visio' });
ev('e6', 'Gala de fin d’année', 'ec3', d(12, 5), d(12, 5), { start_time: '20:00:00' });
ev('e7', 'Randonnée en Champagne', 'ec4', d(10, 24), d(10, 25), { status: 'pending', author_first_name: 'Inès', author_last_name: 'Carrel', author_number: 133, author_promo: 225, author_bucque: 'Perce-Neige' });
ev('e8', 'Afterwork carrières', 'ec5', d(11, 13), d(11, 13), { start_time: '18:30:00' });

const post = (id, title, subtitle, body, authorIndex, days, images = [], cat = null, status = 'published') => db.posts.push({
  id, title, subtitle, body, ...author(authorIndex), category_id: cat, status, is_hidden: false,
  created_at: ago(days), updated_at: ago(days),
  post_images: images.map((n, i) => ({ id: `${id}-i${i}`, path: `img/${id}-${i}-${n}.jpg`, width: n === 'p' ? 900 : 1200, height: n === 'p' ? 1200 : 800, position: i })),
});
post('p1', 'Retour sur le dîner de famille', 'Trois générations autour de la même table', 'Merci à tous ceux qui ont fait le déplacement : nous étions **quarante-deux**, de la Ch 171 à la Ch 225.\n\nQuelques moments forts :\n- le discours des anciens\n- la passation entre promotions\n- les chants, jusque tard dans la nuit\n\nLes photos sont dans la galerie. Rendez-vous l’an prochain !', 1, 0.2, ['l', 'l', 'p', 'l', 'l'], 'pc1');
post('p2', 'Nouvelle étape chez Safran', null, 'Je rejoins le site de Villaroche comme ingénieure méthodes. Si des cousins passent par la Seine-et-Marne, faites signe !', 0, 3, [], 'pc2');
post('p3', 'Une photo retrouvée dans le grenier', 'Ch 171, été 1972', 'En rangeant les affaires de mon père, je suis tombé sur ce tirage. Quelqu’un reconnaît-il les autres visages ?', 4, 9, ['p'], 'pc3');
post('p4', 'Proposition de sortie en Baie de Somme', null, 'Je propose un week-end au printemps. Qui serait partant ?', 2, 0.05, [], null, 'pending');
db.comments.push(
  { id: 'c1', post_id: 'p1', author_name: 'Bernard Delorme', author_bucque: 'Vieux-Chêne', author_promo: 198, body: 'Superbe soirée, bravo aux organisateurs.', is_hidden: false, created_at: ago(0.1), posts: { title: 'Retour sur le dîner de famille' } },
  { id: 'c2', post_id: 'p1', author_name: 'Inès Carrel', author_bucque: 'Perce-Neige', author_promo: 225, body: 'Merci Hugo ! Vivement l’an prochain.', is_hidden: false, created_at: ago(0.05), posts: { title: 'Retour sur le dîner de famille' } },
);
for (let i = 0; i < 14; i += 1) {
  const portrait = i % 4 === 1;
  db.photos.push({
    id: `ph${i}`, path: `gal/${i}.jpg`, thumb_path: `gal/${i}_t.jpg`, width: portrait ? 900 : 1200, height: portrait ? 1200 : 900,
    caption: i % 3 === 0 ? `Souvenir ${i + 1}` : null, album_id: i < 8 ? 'al1' : 'al2', event_id: i < 5 ? 'e1' : null,
    events: i < 5 ? { id: 'e1', title: 'Dîner de la Famille 33', start_date: d(3, 14) } : null,
    promo: i < 8 ? 225 : 171, taken_on: i < 8 ? d(3, 14) : '1972-07-14',
    author_first_name: i % 2 ? 'Hugo' : 'Jacques', author_last_name: i % 2 ? 'Bellec' : 'Ferrand',
    author_number: i % 2 ? 67 : 67, author_promo: i % 2 ? 225 : 171,
    author_bucque: i % 2 ? 'Fend-la-Bise' : 'Grand-Mât',
    status: 'published', is_hidden: false, created_at: ago(i),
  });
}

// --- Images de test (SVG générés) -----------------------------------------------
function hash(s) { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; }
function fakeImage(path) {
  const n = hash(path);
  const hue = [205, 30, 350, 140, 45, 220][n % 6];
  const portrait = /-p\.jpg|\/1(_t)?\.jpg|\/5(_t)?\.jpg|\/9(_t)?\.jpg|\/13(_t)?\.jpg/.test(path) || /-0-p/.test(path);
  const [w, h] = portrait ? [900, 1200] : [1200, 800];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,72%)"/><stop offset="1" stop-color="hsl(${hue + 20},35%,88%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#s)"/><circle cx="${w * (0.2 + (n % 5) / 8)}" cy="${h * 0.3}" r="${h * 0.09}" fill="hsl(${hue + 30},60%,92%)"/><path d="M0 ${h * 0.75} L${w * 0.3} ${h * 0.5} L${w * 0.55} ${h * 0.68} L${w * 0.8} ${h * 0.45} L${w} ${h * 0.62} V${h} H0Z" fill="hsl(${hue},28%,38%)"/><path d="M0 ${h * 0.88} L${w * 0.4} ${h * 0.7} L${w} ${h * 0.86} V${h} H0Z" fill="hsl(${hue},30%,26%)"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// --- Constructeur de requêtes (sous-ensemble de supabase-js) ------------------------
class Query {
  constructor(table) { Object.assign(this, { table, filters: [], orders: [], op: 'select', range_: null, limit_: null, one: false, maybe: false, head: false }); }
  select(_cols, opts = {}) { this.head = Boolean(opts.head); return this; }
  order(c, opts = {}) { if (!opts.referencedTable) this.orders.push([c, opts.ascending !== false]); return this; }
  eq(c, v) { this.filters.push((r) => String(r[c]) === String(v)); return this; }
  neq(c, v) { this.filters.push((r) => String(r[c]) !== String(v)); return this; }
  in(c, list) { this.filters.push((r) => list.map(String).includes(String(r[c]))); return this; }
  is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c, op, v) { if (op === 'is') this.filters.push((r) => (r[c] ?? null) !== v); return this; }
  gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
  lte(c, v) { this.filters.push((r) => r[c] <= v); return this; }
  gt(c, v) { this.filters.push((r) => r[c] > v); return this; }
  lt(c, v) { this.filters.push((r) => r[c] < v); return this; }
  ilike(c, p) { const re = new RegExp(p.replace(/%/g, '.*'), 'i'); this.filters.push((r) => re.test(r[c] ?? '')); return this; }
  or() { return this; }
  textSearch(c, q) { const t = q.toLowerCase(); this.filters.push((r) => `${r.title} ${r.subtitle ?? ''} ${r.body}`.toLowerCase().includes(t)); return this; }
  range(a, b) { this.range_ = [a, b]; return this; }
  limit(n) { this.limit_ = n; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.maybe = true; return this; }
  insert(p) { this.op = 'insert'; this.payload = p; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  upsert(p) { this.op = 'upsert'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  then(ok, ko) { return new Promise((r) => setTimeout(r, 40)).then(() => this.run()).then(ok, ko); }
  run() {
    const rows = db[this.table] ?? (db[this.table] = []);
    const match = (r) => this.filters.every((f) => f(r));
    const clone = (x) => JSON.parse(JSON.stringify(x));
    if (this.op === 'insert' || this.op === 'upsert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p) => {
        // Comme dans la base : un dépôt de visiteur passe en attente lorsque
        // la relecture est activée, et ne peut pas se publier lui-même.
        const approvalKey = { posts: 'posts.require_approval', photos: 'photos.require_approval', events: 'events.require_approval' }[this.table];
        if (approvalKey && !isAdmin()) {
          p = { ...p, status: settingValue(approvalKey) !== false ? 'pending' : 'published', is_hidden: false };
        }
        const key = this.table === 'site_settings' ? 'key' : 'id';
        const existing = rows.find((r) => p[key] !== undefined && r[key] === p[key]);
        if (existing) return Object.assign(existing, p);
        const row = { id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), post_images: [], comments: [{ count: 0 }], ...p };
        rows.unshift(row);
        return row;
      });
      return { data: this.one ? clone(list[0]) : clone(list), error: null };
    }
    let result = rows.filter(match);
    // Lecture publique : les contributions en attente ou masquées sont invisibles.
    if (!isAdmin() && ['posts', 'photos', 'events'].includes(this.table)) {
      result = result.filter((r) => r.status !== 'pending' && !r.is_hidden);
    }
    if (!isAdmin() && this.table === 'comments') result = result.filter((r) => !r.is_hidden);
    if (this.op === 'update') { result.forEach((r) => Object.assign(r, this.payload, { updated_at: new Date().toISOString() })); return { data: clone(result), error: null }; }
    if (this.op === 'delete') { db[this.table] = rows.filter((r) => !match(r)); return { data: null, error: null }; }
    for (const [c, asc] of [...this.orders].reverse()) {
      result = [...result].sort((a, b) => ((a[c] ?? '') > (b[c] ?? '') ? 1 : (a[c] ?? '') < (b[c] ?? '') ? -1 : 0) * (asc ? 1 : -1));
    }
    const count = result.length;
    if (this.range_) result = result.slice(this.range_[0], this.range_[1] + 1);
    if (this.limit_) result = result.slice(0, this.limit_);
    if (this.head) return { data: null, count, error: null };
    if (this.one || this.maybe) return { data: result[0] ? clone(result[0]) : null, error: null };
    return { data: clone(result), count, error: null };
  }
}

let session = null;
const isAdmin = () => Boolean(session);
const settingValue = (key) => db.site_settings.find((r) => r.key === key)?.value;
const listeners = [];

export function createClient() {
  return {
    from: (table) => new Query(table),
    rpc: async (name, args) => {
      if (['touch_last_login', 'admin_touch_login'].includes(name)) return { data: null, error: null };
      if (name === 'admin_storage_trash') return { data: [], error: null };
      if (name === 'admin_storage_trash_clear') return { data: 0, error: null };
      if (name === 'update_post_with_token') {
        const p = db.posts.find((x) => x.id === args.p_id);
        if (p) Object.assign(p, { title: args.p_title, subtitle: args.p_subtitle, body: args.p_body, category_id: args.p_category_id });
        return { data: Boolean(p), error: null };
      }
      if (['delete_post_with_token', 'delete_photo_with_token', 'delete_event_with_token'].includes(name)) {
        const table = name.includes('photo') ? 'photos' : name.includes('event') ? 'events' : 'posts';
        const before = db[table].length;
        db[table] = db[table].filter((x) => x.id !== args.p_id);
        return { data: db[table].length < before, error: null };
      }
      if (name === 'my_posts') {
        const tokens = args?.p_tokens ?? [];
        const data = db.posts.filter((p) => tokens.includes(p.edit_token)).map((p) => ({
          id: p.id, title: p.title, status: p.status, is_hidden: p.is_hidden, created_at: p.created_at,
          image_paths: (p.post_images ?? []).map((i) => i.path),
        })).sort((a, b) => b.created_at.localeCompare(a.created_at));
        return { data, error: null };
      }
      if (name === 'contributors') {
        const q = (args?.p_query ?? '').toLowerCase();
        const groups = new Map();
        for (const p of db.posts.filter((x) => x.status === 'published' && !x.is_hidden)) {
          const key = `${p.author_number}|${p.author_promo}|${p.author_bucque.toLowerCase()}`;
          const entry = groups.get(key);
          if (!entry || entry.last_post_at < p.created_at) {
            groups.set(key, {
              first_name: p.author_first_name, last_name: p.author_last_name, bucque: p.author_bucque,
              number: p.author_number, promo: p.author_promo, company: p.author_company, job: p.author_job,
              sector: p.author_sector, status: p.author_status, city: p.author_city, region: p.author_region,
              country: p.author_country, note: p.author_note,
              email: p.show_contact ? p.author_email : null,
              posts_count: (entry?.posts_count ?? 0) + 1, last_post_at: p.created_at,
            });
          } else {
            entry.posts_count += 1;
          }
        }
        const data = [...groups.values()]
          .filter((m) => !q || JSON.stringify(m).toLowerCase().includes(q))
          .sort((a, b) => b.promo - a.promo || a.number - b.number);
        return { data, error: null };
      }
      return { data: null, error: { message: 'rpc inconnue' } };
    },
    storage: {
      from: () => ({
        getPublicUrl: (path) => ({ data: { publicUrl: fakeImage(path) } }),
        upload: async () => ({ data: {}, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
    auth: {
      getSession: async () => ({ data: { session } }),
      signInWithPassword: async ({ email, password }) => {
        if (!String(email).startsWith('master33@') || String(password).length < 6) {
          return { data: {}, error: { message: 'Invalid login credentials' } };
        }
        session = { user: { id: 'u-master' } };
        return { data: { session, user: session.user }, error: null };
      },
      updateUser: async () => ({ data: {}, error: null }),
      getUser: async () => ({ data: { user: session?.user ?? null } }),
      signOut: async () => { session = null; listeners.forEach((l) => l('SIGNED_OUT')); return { error: null }; },
      onAuthStateChange: (cb) => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
    },
  };
}
