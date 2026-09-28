// 小さな DOM 生成ヘルパー。
// h('button', { class: 'btn', onClick: fn }, '押す')

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function button(label, onClick, { variant = 'primary', small = false, ...rest } = {}) {
  const cls = `btn btn--${variant}${small ? ' btn--small' : ''}`;
  return h('button', { type: 'button', class: cls, onClick, ...rest }, label);
}
