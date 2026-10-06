/**
 * Small DOM helpers. Text is always set via textContent, never innerHTML,
 * so config strings cannot inject markup.
 */

/**
 * Create an element.
 * @param {string} tag
 * @param {object} [props] class, text, attrs, dataset, on (event map), plus any DOM property
 * @param {...(Node|string|null|false)} children
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'attrs') for (const [name, v] of Object.entries(value)) node.setAttribute(name, v);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'on') for (const [name, fn] of Object.entries(value)) node.addEventListener(name, fn);
    else node[key] = value;
  }
  append(node, children);
  return node;
}

/**
 * Append children, skipping empty values.
 * @param {Node} parent
 * @param {Array} children
 */
export function append(parent, children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/**
 * Remove all children and append new ones.
 * @param {Node} parent
 * @param {...any} children
 */
export function replaceChildren(parent, ...children) {
  parent.replaceChildren();
  return append(parent, children);
}

/** @returns {boolean} true if the user asked for reduced motion */
export function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
