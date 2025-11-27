let currentComputation = null;

const createScheduler = () => {
  const queue = new Set();
  let pending = false;

  const schedule = (callback) => {
    queue.add(callback);
    if (!pending) {
      pending = true;
      queueMicrotask(() => {
        // Run all queued callbacks
        queue.forEach((cb) => {
          try {
            cb();
          } catch (e) {
            console.error("Computation failed:", e);
          }
        });
        queue.clear();
        pending = false;
      });
    }
  };

  return { schedule };
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
 * @param {() => any} fn
 * @returns {() => any}
 */
export const computed = (fn) => {
  const [value, setValue] = signal();

  subscribe(() => {
    const newValue = fn();

    setValue(newValue);
  });

  return value;
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
      const apply = (value) => {
        if (key in el) {
          el[key] = value;
        } else if (value !== false && value !== null && value !== undefined) {
          el.setAttribute(key, value);
        } else {
          el.removeAttribute(key);
        }
      };

      if (typeof value === "function") {
        subscribe(() => {
          apply(value());
        });
      } else {
        apply(value);
      }
    }
  });

  const appendChildRecursive = (child) => {
    if (child === null || child === undefined) return;

    if (typeof child === "function") {
      const initialNode = document.createTextNode("");
      el.appendChild(initialNode);

      const endMarker = document.createComment("reactive-end");
      el.appendChild(endMarker);

      let mountedNodes = [initialNode];
      let nodeCache = new Map();

      subscribe(() => {
        const value = child();
        const rawNodes = Array.isArray(value) ? value : [value];

        const newCandidates = rawNodes.map((element) => {
          if (element instanceof Node) {
            return element;
          }

          if (rawNodes.length === 1) {
            if (initialNode.nodeValue !== String(element)) {
              initialNode.nodeValue = String(element);
            }
            return initialNode;
          }
          return document.createTextNode(String(element));
        });

        if (newCandidates.length === 1 && newCandidates[0] === initialNode) {
          if (mountedNodes.length > 1 || (mountedNodes.length === 1 && mountedNodes[0] !== initialNode)) {
            mountedNodes.forEach((node) => node !== initialNode && node.remove());
            mountedNodes = [initialNode];
          }
          return;
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
          if (node !== initialNode && finalNodeSet.has(node) === false) {
            node.remove();
          }
        });

        let currentRef = initialNode;
        finalNodes.forEach((node) => {
          const nextSiblingInDOM = currentRef.nextSibling;

          if (nextSiblingInDOM !== node) {
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
