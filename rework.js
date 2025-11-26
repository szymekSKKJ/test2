const injectFontAwesome = (shadowRoot) => {
  const script = document.createElement("script");
  const link = document.createElement("link");

  link.href = "https://ka-f.fontawesome.com/releases/v7.1.0/css/free.min.css";
  link.rel = "stylesheet";

  script.src = "https://kit.fontawesome.com/4ee428d81d.js";
  script.crossOrigin = "anonymous";

  shadowRoot.appendChild(script);
  shadowRoot.appendChild(link);
};

/**
 *
 * @param {HTMLElement} thisElement
 * @param {string} cssUrl
 * @returns {ShadowRoot}
 */

export const initializeWebComponent = (thisElement, cssUrl) => {
  const shadow = thisElement.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
        @import url('${cssUrl}');
    `;

  injectFontAwesome(shadow);

  shadow.appendChild(style);

  return shadow;
};

/**
 *
 * @template {keyof HTMLElementTagNameMap} T
 * @param {T} type
 * @param {Partial<CSSStyleDeclaration> & {className: string}} [styles]
 * @param {Partial<HTMLElementTagNameMap[T]>} [attributes]
 * @param {(Record<string, (this: HTMLElementTagNameMap[T], ev: Event) => void>)} [events]
 * @param {Array<HTMLElement>} [children]
 * @returns {{
 *  element: HTMLElementTagNameMap[T],
 *  props: {
 *    type: {T},
 *    styles: Partial<CSSStyleDeclaration> & {className: string},
 *    attributes: Partial<HTMLElementTagNameMap[T]>,
 *    events: (Record<string, (this: HTMLElementTagNameMap[T], ev: Event) => void>),
 *    children: Array<HTMLElement>,
 *  },
 *  update: ( styles: Partial<CSSStyleDeclaration> & {className: string}, attributes:  Partial<HTMLElementTagNameMap[T]>,events: (Record<string, (this: HTMLElementTagNameMap[T], ev: Event) => void>, children: Array<HTMLElement>)) => void
 * }}
 */

let currentComputation = null;

const createScheduler = () => {
  const queue = new Set();
  let pending = false;

  const schedule = (callback) => {
    queue.add(callback);
    if (pending === false) {
      pending = true;

      queueMicrotask(() => {
        queue.forEach((callback) => callback());
        queue.clear();
        pending = false;
      });
    }
  };

  return { schedule };
};

const scheduler = createScheduler();

export const signal = (initialValue) => {
  let value = initialValue;
  const subscribers = new Set();

  const get = () => {
    if (currentComputation !== null) {
      subscribers.add(currentComputation);
      currentComputation.deps.add(subscribers);
    }
    return value;
  };

  const set = (newValue) => {
    if (newValue === value) return;
    value = newValue;
    subscribers.forEach((fn) => scheduler.schedule(fn));
  };

  return [get, set];
};

const subscribe = (fn) => {
  const wrapped = () => {
    cleanup(wrapped);
    currentComputation = wrapped;
    fn();
    currentComputation = null;
  };

  wrapped.deps = new Set();

  wrapped();
};

const cleanup = (computation) => {
  computation.deps.forEach((depSet) => depSet.delete(computation));
  computation.deps.clear();
};

export const useEffect = (effect, deps) => {
  let cleanupFn = null;
  let prevValues = [];

  subscribe(() => {
    const currentValues = deps.map((dep) => dep());

    const changed = currentValues.some((val, i) => val !== prevValues[i]);

    if (changed === true) {
      if (typeof cleanupFn === "function") {
        cleanupFn();
      }

      cleanupFn = effect() || null;

      prevValues = currentValues;
    }
  });
};

export const createElement = (tagName, props = {}, children = []) => {
  const el = document.createElement(tagName);

  Object.entries(props).forEach(([key, value]) => {
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "style" && typeof value === "object") {
      Object.entries(value).forEach(([styleKey, styleVal]) => {
        if (typeof styleVal === "function") {
          subscribe(() => {
            el.style[styleKey] = styleVal();
          });
        } else {
          el.style[styleKey] = styleVal;
        }
      });
    } else {
      const apply = (val) => {
        if (key in el) el[key] = val;
        else el.setAttribute(key, val);
      };

      if (typeof value === "function") {
        subscribe(() => apply(value()));
      } else {
        apply(value);
      }
    }
  });

  // const appendChildRecursive = (child) => {
  //   if (Array.isArray(child)) {
  //     child.forEach(appendChildRecursive);
  //   } else if (child instanceof Node) {
  //     el.appendChild(child);
  //   } else if (typeof child === "function") {
  //     const textNode = document.createTextNode("");
  //     subscribe(() => (textNode.textContent = child()));
  //     el.appendChild(textNode);
  //   } else {
  //     el.appendChild(document.createTextNode(child));
  //   }
  // };

  const appendChildRecursive = (child) => {
    if (child === undefined || child === null) {
      return;
    }

    if (typeof child === "function") {
      const placeholder = document.createComment("dynamic-child");
      el.appendChild(placeholder);

      let mounted = null;

      const render = () => {
        const value = child();

        if (mounted) {
          mounted.forEach((n) => n.remove());
        }
        mounted = [];

        if (value == null) return;

        // Normalize to array
        const nodes = Array.isArray(value) ? value : [value];

        nodes.forEach((val) => {
          let node;

          if (val instanceof Node) {
            node = val;
          } else {
            node = document.createTextNode(String(val));
          }

          placeholder.after(node);
          mounted.push(node);
        });
      };

      subscribe(render);
      return;
    }

    if (Array.isArray(child)) {
      child.forEach(appendChildRecursive);
      return;
    }

    if (child instanceof Node) {
      el.appendChild(child);
      return;
    }

    el.appendChild(document.createTextNode(child));
  };

  children.forEach(appendChildRecursive);

  return el;
};
