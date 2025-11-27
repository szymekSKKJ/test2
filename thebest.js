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

  const runReactions = () => {
    queue.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error("Reactive update failed:", e);
      }
    });
    queue.clear();
    pending = false;
  };

  const schedule = (callback) => {
    queue.add(callback);
    if (!pending) {
      pending = true;

      queueMicrotask(runReactions);
    }
  };

  return { schedule };
};

const scheduler = createScheduler();

const cleanup = (computation) => {
  computation.deps.forEach((depSet) => depSet.delete(computation));
  computation.deps.clear();
};

const createComputation = (fn) => {
  const wrapped = () => {
    cleanup(wrapped);

    currentComputation = wrapped;

    try {
      fn();
    } catch (e) {
      console.error("Error during computation execution:", e);
    }

    currentComputation = null;
  };

  wrapped.deps = new Set();
  return wrapped;
};

const subscribe = (fn) => {
  const wrapped = createComputation(fn);

  wrapped();
};

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
    if (Object.is(newValue, value)) return;
    value = newValue;

    subscribers.forEach((fn) => scheduler.schedule(fn));
  };

  return [get, set];
};

export const computed = (fn) => {
  const [getComputedValue, setComputedValue] = signal(undefined);

  subscribe(() => {
    const newValue = fn();
    setComputedValue(newValue);
  });

  return getComputedValue;
};

export const createEffect = (effect) => {
  let cleanupFn = null;

  const effectWrapper = createComputation(() => {
    if (typeof cleanupFn === "function") {
      cleanupFn();
    }

    cleanupFn = effect() || null;
  });

  effectWrapper();

  return () => cleanup(effectWrapper);
};

const reconcileChildren = (el, childFn) => {
  const startMarker = document.createTextNode("");
  const endMarker = document.createComment("reactive-end");
  el.appendChild(startMarker);
  el.appendChild(endMarker);

  let mountedNodes = [];
  let nodeCache = new Map();

  subscribe(() => {
    const value = childFn();
    const rawCandidates = Array.isArray(value) ? value : [value];

    const newCandidates = rawCandidates.map((element) => {
      if (element instanceof Node) {
        return element;
      }
      return document.createTextNode(String(element));
    });

    if (newCandidates.length === 1 && newCandidates[0].nodeType === Node.TEXT_NODE) {
      if (newCandidates[0] === startMarker) {
        const textNode = startMarker;
        const newText = String(rawCandidates[0]);

        if (textNode.nodeValue !== newText) {
          textNode.nodeValue = newText;
        }

        let current = textNode.nextSibling;
        while (current && current !== endMarker) {
          const next = current.nextSibling;
          current.remove();
          current = next;
        }

        mountedNodes = [textNode];
        return;
      }
    }

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
      if (node !== startMarker && !finalNodeSet.has(node)) {
        node.remove();
      }
    });

    let currentRef = startMarker;
    finalNodes.forEach((node) => {
      if (currentRef.nextSibling !== node) {
        el.insertBefore(node, currentRef.nextSibling);
      }
      currentRef = node;
    });

    let garbageNode = currentRef.nextSibling;
    while (garbageNode && garbageNode !== endMarker) {
      const next = garbageNode.nextSibling;
      garbageNode.remove();
      garbageNode = next;
    }

    mountedNodes = finalNodes;
    nodeCache = nextNodeCache;
  });
};

export const createElement = (tagName, props = {}, children = []) => {
  const el = document.createElement(tagName);

  const key = props.key;
  delete props.key;

  if (key !== null) {
    el._key = key;
  }

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
        if (key in el) {
          el[key] = val;
        } else if (val !== false && val !== null && val !== undefined) {
          el.setAttribute(key, val);
        } else {
          el.removeAttribute(key);
        }
      };

      if (typeof value === "function") {
        subscribe(() => apply(value()));
      } else {
        apply(value);
      }
    }
  });

  const appendChildRecursive = (child) => {
    if (child === null || child === undefined) return;

    if (typeof child === "function") {
      reconcileChildren(el, child);
    } else if (Array.isArray(child)) {
      child.forEach(appendChildRecursive);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  };

  children.forEach(appendChildRecursive);

  return el;
};
