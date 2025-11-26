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
const initializeWebComponent = (thisElement, cssUrl) => {
  const shadow = thisElement.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
        @import url('${cssUrl}');
    `;

  injectFontAwesome(shadow);

  shadow.appendChild(style);

  return shadow;
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

const scheduler = createScheduler();

/**
 * Create a reactive signal with getter and setter
 * @param {any} initialValue
 * @returns {[() => any, (newValue: any) => void]}
 */
const signal = (initialValue) => {
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
 * Subscribe a function reactively
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
 * Reactive effect hook with dependency tracking
 * @param {() => void | (() => void)} effect
 * @param {Array<() => any>} deps
 */
const useEffect = (effect, deps) => {
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
 * Create DOM element with reactive props, styles, events, and children
 * @param {string} tagName
 * @param {Object} props - attributes, events, styles
 * @param {Array<any>} children - strings, Nodes, or functions returning those
 * @returns {HTMLElement}
 */
const createElement = (tagName, props = {}, children = []) => {
  const el = document.createElement(tagName);

  Object.entries(props).forEach(([key, value]) => {
    if (key.startsWith("on") && typeof value === "function") {
      // Add event listener
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "style" && typeof value === "object") {
      // Handle style object, support reactive style properties
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
      // Set attribute or property, support reactive values
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

  // Append children recursively, support reactive functions and arrays
  const appendChildRecursive = (child) => {
    if (child == null) return;

    if (typeof child === "function") {
      const placeholder = document.createComment("dynamic-child");
      el.appendChild(placeholder);

      let mounted = [];

      const render = () => {
        const value = child();

        // Remove previous nodes
        mounted.forEach((n) => n.remove());
        mounted = [];

        if (value == null) return;

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

const [counterGet, counterSet] = signal(0);

const element = createElement(
  "div",
  {
    onClick: () => {
      counterSet(counterGet() + 1);
    },
  },
  [
    createElement("div", [], ["aa"]),
    () => {
      return `${counterGet()}`;
    },
  ]
);

document.body.appendChild(element);

// const [itemsGet, itemsSet] = signal([
//   { id: crypto.randomUUID(), count: 0 },
//   { id: crypto.randomUUID(), count: 0 },
//   { id: crypto.randomUUID(), count: 0 },
// ]);

// const app = createElement("div", { style: { fontFamily: "sans-serif" } }, [
//   createElement("div", {}, ["pl"]),
//   () => {
//     return itemsGet().map((item) =>
//       createElement(
//         "div",
//         {
//           key: item.id,
//           style: {
//             padding: "8px",
//             margin: "4px",
//             border: "1px solid #ccc",
//             display: "inline-block",
//             cursor: "pointer",
//           },
//           onclick: () => {
//             const arr = [...itemsGet()];
//             const idx = arr.findIndex((x) => x.id === item.id);
//             arr[idx] = { ...arr[idx], count: arr[idx].count + 1 };
//             itemsSet(arr);
//           },
//         },
//         [`ID: ${item.id.slice(0, 4)} — Count: ${item.count}`]
//       )
//     );
//   },
// ]);

// document.body.appendChild(app);
