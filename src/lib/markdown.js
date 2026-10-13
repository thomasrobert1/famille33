// Mise en forme simple et SÛRE du texte des articles.
// Syntaxe : **gras**, *italique*, listes « - » ou « 1. », liens [texte](https://…),
// adresses web détectées automatiquement, paragraphes séparés par une ligne vide.
// Tout le texte est échappé AVANT d'appliquer la mise en forme : seules les
// balises <p>, <br>, <strong>, <em>, <ul>, <ol>, <li> et <a href="http(s)://…">
// peuvent être produites.

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emphasis(escaped) {
  return escaped
    .replace(/\*\*(?=\S)([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)\*(?![*\w])/g, '$1<em>$2</em>');
}

function link(url, label) {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
}

const INLINE_RE = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s()<>]{1,500})\)|(https?:\/\/[^\s<>"]{2,500})/g;

export function renderInline(raw) {
  const out = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let match;
  while ((match = INLINE_RE.exec(raw))) {
    out.push(emphasis(escapeHtml(raw.slice(last, match.index))));
    if (match[1]) {
      out.push(link(match[2], emphasis(escapeHtml(match[1]))));
    } else {
      let url = match[3];
      const trailing = /[.,;:!?)\]»]+$/.exec(url);
      if (trailing) url = url.slice(0, -trailing[0].length);
      out.push(link(url, escapeHtml(url)));
      if (trailing) out.push(escapeHtml(trailing[0]));
    }
    last = INLINE_RE.lastIndex;
  }
  out.push(emphasis(escapeHtml(raw.slice(last))));
  return out.join('');
}

export function renderMarkdown(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(`<${list.type}>${list.items.map((i) => `<li>${renderInline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };

  for (const line of lines) {
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line) || /^\s*\*\s+(.*)$/.exec(line);
    const numbered = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((bullet || numbered)[1]);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks.join('');
}

// Texte brut sans balisage, pour les aperçus et la recherche
export function plainText(text) {
  return String(text ?? '')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*([-•*]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(text, max = 360) {
  const plain = plainText(text);
  if (plain.length <= max) return { text: plain, truncated: false };
  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return { text: `${cut.slice(0, space > max * 0.6 ? space : max).replace(/[,;:.\s]+$/, '')}…`, truncated: true };
}
