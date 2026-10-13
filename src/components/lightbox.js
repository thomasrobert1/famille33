// Visionneuse plein écran : clavier (← →, Échap), boutons et balayage tactile.
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { publicUrl } from '../lib/storage.js';

export function openLightbox({ items, index = 0, bucket, meta, actions }) {
  let current = index;
  const img = h('img', { class: 'lightbox__img', alt: '' });
  const counter = h('span', { class: 'lightbox__counter', 'aria-live': 'polite' });
  const info = h('div', { class: 'lightbox__info' });
  const prev = h('button', { class: 'lightbox__nav lightbox__nav--prev', type: 'button', 'aria-label': 'Photo précédente', onClick: () => show(current - 1) }, icon('chevron-left', { size: 30 }));
  const next = h('button', { class: 'lightbox__nav lightbox__nav--next', type: 'button', 'aria-label': 'Photo suivante', onClick: () => show(current + 1) }, icon('chevron-right', { size: 30 }));
  const closeBtn = h('button', { class: 'lightbox__close', type: 'button', 'aria-label': 'Fermer la visionneuse', onClick: () => close() }, icon('x', { size: 26 }));
  const stage = h('div', { class: 'lightbox__stage' }, img);
  const dialog = h('dialog', { class: 'lightbox', 'aria-label': 'Visionneuse de photos' },
    h('div', { class: 'lightbox__top' }, counter, closeBtn), stage, prev, next, info);

  function show(i) {
    if (!items.length) return close();
    current = (i + items.length) % items.length;
    const item = items[current];
    counter.textContent = items.length > 1 ? `${current + 1} / ${items.length}` : '';
    prev.hidden = next.hidden = items.length < 2;
    img.src = publicUrl(bucket, item.path) ?? '';
    img.alt = item.caption || 'Photo';
    if (item.width && item.height) img.style.aspectRatio = `${item.width} / ${item.height}`;
    info.replaceChildren(
      item.caption ? h('p', { class: 'lightbox__caption' }, item.caption) : null,
      meta ? meta(item) : null,
      actions ? actions(item, close) : null);
    const following = items[(current + 1) % items.length];
    if (following && following !== item) new Image().src = publicUrl(bucket, following.path) ?? '';
  }

  function close() {
    dialog.close();
    dialog.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  }
  let touchX = null;
  stage.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    touchX = null;
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  stage.addEventListener('click', (e) => { if (e.target === stage) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(dialog);
  dialog.showModal();
  closeBtn.focus();
  show(current);
  return {
    close,
    refresh: () => show(current),
    remove(item) {
      const i = items.indexOf(item);
      if (i >= 0) items.splice(i, 1);
      show(current);
    },
  };
}
