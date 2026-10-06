/**
 * Connect-the-dots: tap the numbered dots in order or drag through them.
 * Tapping a dot out of order never counts as a mistake; the next dot just
 * pulses gently.
 */
import { h } from '../lib/dom.js';
import { connect, dotAt, pathData, validatePoints } from '../logic/dots.js';

const SVG = 'http://www.w3.org/2000/svg';
/** Default shape: a five-pointed star (10 dots). */
const STAR = Array.from({ length: 10 }, (_, i) => {
  const angle = -Math.PI / 2 + (i * Math.PI) / 5;
  const radius = i % 2 ? 19 : 44;
  return [Math.round(50 + radius * Math.cos(angle)), Math.round(54 + radius * Math.sin(angle))];
});

export default {
  id: 'dots',
  title: 'dots.title',

  /** @param {object} options */
  validate(options) {
    const errors = options.points === undefined ? [] : validatePoints(options.points);
    if (options.closed !== undefined && typeof options.closed !== 'boolean') errors.push('closed must be true or false.');
    if (options.name !== undefined && typeof options.name !== 'string') errors.push('name must be text in quotes, for example "a star".');
    return errors;
  },

  /**
   * @param {HTMLElement} container
   * @param {{ points?: number[][], closed?: boolean, name?: string }} options
   * @param {object} api
   */
  mount(container, options, api) {
    const { t } = api;
    const points = options.points ?? STAR;
    const closed = options.closed ?? true;
    const total = points.length;
    let connected = 0;
    let dragging = false;

    const svg = svgElement('svg', { class: 'cq-dots-lines', viewBox: '0 0 100 100', 'aria-hidden': 'true' });
    const shape = svgElement('path', { class: 'cq-dots-shape' });
    const trail = svgElement('path', { class: 'cq-dots-trail' });
    const rubber = svgElement('line', { class: 'cq-dots-rubber' });
    rubber.style.display = 'none';
    svg.append(shape, trail, rubber);

    const dots = points.map(([x, y], index) => {
      const dot = h('button', { type: 'button', class: 'cq-dot', on: { click: () => tapDot(index) } }, h('span', { text: String(index + 1) }));
      dot.style.setProperty('--x', x);
      dot.style.setProperty('--y', y);
      return dot;
    });
    const board = h('div', { class: 'cq-board cq-dots', attrs: { role: 'group', 'aria-label': t('dots.board') } }, svg, dots);
    const progress = h('p', { class: 'cq-note text-center' });
    container.replaceChildren(h('div', { class: 'cq-dots-wrap' }, board, progress));

    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove);
    board.addEventListener('pointerup', endDrag);
    board.addEventListener('pointercancel', endDrag);
    render();

    api.hint(() => {
      if (connected < total) advance(connected);
    });

    function tapDot(index) {
      if (connected >= total) return;
      if (index === connected) return advance(index);
      if (index > connected) nudge();
    }

    function advance(index) {
      const next = connect(connected, index, total);
      if (next === connected) return;
      connected = next;
      render();
      if (connected === total) complete();
    }

    function nudge() {
      const dot = dots[connected];
      dot.classList.remove('is-nudged');
      void dot.offsetWidth; // restart the animation
      dot.classList.add('is-nudged');
      api.announce(t('dots.next', { n: connected + 1 }));
    }

    function complete() {
      board.classList.add('is-complete');
      endDrag();
      api.announce(options.name ? t('dots.complete', { shape: options.name }) : t('dots.completeUnnamed'));
      api.onSolved();
    }

    /** Convert a pointer event to board units (0..100) and a hit radius. */
    function toBoard(event) {
      const rect = svg.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
        radius: (26 / rect.width) * 100,
      };
    }

    function onPointerDown(event) {
      if (connected >= total) return;
      const { x, y, radius } = toBoard(event);
      if (dotAt(points, x, y, radius) !== connected && connected === 0) return;
      dragging = true;
      board.setPointerCapture?.(event.pointerId);
      onPointerMove(event);
    }

    function onPointerMove(event) {
      if (!dragging || connected >= total) return;
      const { x, y, radius } = toBoard(event);
      if (dotAt(points, x, y, radius) === connected) advance(connected);
      if (connected > 0 && connected < total) {
        const [lx, ly] = points[connected - 1];
        setAttributes(rubber, { x1: lx, y1: ly, x2: x, y2: y });
        rubber.style.display = '';
      }
    }

    function endDrag() {
      dragging = false;
      rubber.style.display = 'none';
    }

    function render() {
      const d = pathData(points, connected, closed);
      trail.setAttribute('d', d);
      shape.setAttribute('d', connected === total ? d : '');
      dots.forEach((dot, index) => {
        const done = index < connected;
        dot.classList.toggle('is-done', done);
        dot.classList.toggle('is-next', index === connected);
        dot.setAttribute('aria-label', t(done ? 'dots.dotDone' : 'dots.dot', { n: index + 1 }));
      });
      progress.textContent = t('dots.progress', { n: connected, total });
    }

    return () => endDrag();
  },
};

function svgElement(tag, attributes) {
  return setAttributes(document.createElementNS(SVG, tag), attributes);
}

function setAttributes(node, attributes) {
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}
