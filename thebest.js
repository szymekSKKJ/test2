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
  if (thisElement.shadowRoot === null) {
    const shadow = thisElement.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
        @import url('${cssUrl}');
    `;

    injectFontAwesome(shadow);

    shadow.appendChild(style);

    return shadow;
  } else {
    return thisElement.shadowRoot;
  }
};

let currentComputation = null;

const createScheduler = () => {
  const queue = new Set();
  let pending = false;

  const schedule = (callback) => {
    queue.add(callback);
    if (!pending) {
      pending = true;
      queueMicrotask(() => {
        queue.forEach((cb) => cb());
        queue.clear();
        pending = false;
      });
    }
  };

  return { schedule };
};

/**
 * @param {() => Array<any>} sourceSignal
 * @param {(item, index) => Node} mapFn
 * @param {(item) => any} keyFn
 */
export const mapSignal = (sourceSignal, mapFn, keyFn) => {
  let cache = new Map();

  return () => {
    const items = sourceSignal();
    const newCache = new Map();
    const result = [];

    items.forEach((item, index) => {
      const key = keyFn(item);
      let node;

      if (cache.has(key)) {
        node = cache.get(key);
      } else {
        node = mapFn(item, index);
      }

      newCache.set(key, node);
      result.push(node);
    });

    cache = newCache;
    return result;
  };
};

const scheduler = createScheduler();

/**
 * @param {any} initialValue
 * @returns {[() => any, (newValue: any) => void]}
 */

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

/**
 * @param {() => void} fn
 */
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

/**
 * @param {() => void | (() => void)} effect
 * @param {Array<() => any>} deps
 */
export const useEffect = (effect, deps) => {
  let cleanupFn = null;
  let prevValues = [];

  subscribe(() => {
    const currentValues = deps.map((dep) => dep());
    const changed = currentValues.some((val, i) => val !== prevValues[i]);

    if (changed) {
      if (typeof cleanupFn === "function") {
        cleanupFn();
      }
      cleanupFn = effect() || null;
      prevValues = currentValues;
    }
  });
};

/**
 * @param {string} tagName
 * @param {Object} props
 * @param {Array<any>} children
 * @returns {HTMLElement}
 */

export const createElement = (tagName, props = {}, children = []) => {
  const el = document.createElement(tagName);

  const key = props.key;
  delete props.key;
  if (key != null) el._key = key;

  Object.entries(props).forEach(([key, value]) => {
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "style" && typeof value === "object") {
      Object.entries(value).forEach(([styleKey, styleVal]) => {
        if (typeof styleVal === "function") {
          subscribe(() => (el.style[styleKey] = styleVal()));
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

  const appendChildRecursive = (child) => {
    if (child === null) return;

    if (typeof child === "function") {
      const placeholder = document.createComment("dynamic-child");
      el.appendChild(placeholder);

      let nodeCache = new Map();
      let mountedNodes = [];

      const render = () => {
        const value = child();

        const rawNodes = Array.isArray(value) ? value : [value];
        const newCandidates = rawNodes.map((val) => {
          if (val instanceof Node) return val;
          return document.createTextNode(String(val));
        });

        const nextNodeCache = new Map();
        const finalNodes = [];

        newCandidates.forEach((candidate) => {
          const candidateKey = candidate._key;

          if (candidateKey != null) {
            let nodeToUse = candidate;

            if (nodeCache.has(candidateKey)) {
              nodeToUse = nodeCache.get(candidateKey);
            }

            nextNodeCache.set(candidateKey, nodeToUse);
            finalNodes.push(nodeToUse);
          } else {
            finalNodes.push(candidate);
          }
        });

        const finalNodeSet = new Set(finalNodes);

        mountedNodes.forEach((node) => {
          if (!finalNodeSet.has(node)) {
            node.remove();
          }
        });

        let currentRef = placeholder;

        finalNodes.forEach((node) => {
          if (currentRef.nextSibling !== node) {
            currentRef.after(node);
          }
          currentRef = node;
        });

        mountedNodes = finalNodes;
        nodeCache = nextNodeCache;
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
