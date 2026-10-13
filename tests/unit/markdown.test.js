import { describe, it, expect } from 'vitest';
import { renderMarkdown, excerpt, plainText } from '../../src/lib/markdown.js';

describe('mise en forme sûre', () => {
  it('neutralise le HTML et les scripts', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<script|<img/);
    expect(html).toContain('&lt;script&gt;');
  });
  it('refuse les liens javascript: et data:', () => {
    expect(renderMarkdown('[clic](javascript:alert(1))')).not.toContain('href="javascript');
    expect(renderMarkdown('[clic](data:text/html,x)')).not.toContain('href="data');
  });
  it('n’autorise pas l’évasion d’attribut dans un lien', () => {
    const html = renderMarkdown('[a](https://exemple.fr/"onmouseover="alert(1))');
    expect(html).not.toMatch(/"\s*onmouseover=/);
  });
  it('gère gras, italique, listes, liens et paragraphes', () => {
    const html = renderMarkdown('**Gras** et *italique*\n\n- un\n- deux\n\n1. premier\n\nVoir https://exemple.fr.');
    expect(html).toContain('<strong>Gras</strong>');
    expect(html).toContain('<em>italique</em>');
    expect(html).toContain('<ul><li>un</li><li>deux</li></ul>');
    expect(html).toContain('<ol><li>premier</li></ol>');
    expect(html).toContain('<a href="https://exemple.fr" target="_blank" rel="noopener noreferrer nofollow">https://exemple.fr</a>.');
  });
  it('produit des extraits en texte brut', () => {
    expect(plainText('**Bonjour** [ici](https://a.fr)')).toBe('Bonjour ici');
    const { text, truncated } = excerpt('mot '.repeat(200), 50);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(51);
    expect(text.endsWith('…')).toBe(true);
  });
});
