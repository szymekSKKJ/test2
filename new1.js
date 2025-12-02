let currentComputation = null;
function subscribe(fn) {
  const computation = {
    fn,
    deps: new Set(),
  };
  function run() {
    cleanup(computation);
    currentComputation = computation;
    try {
      fn();
    } catch (e) {
      console.error("Reactive update failed:", e);
    }
    currentComputation = null;
  }
  run();
  return computation;
}
function cleanup(computation) {
  computation.deps.forEach((depSet) => depSet.delete(computation));
  computation.deps.clear();
}
const updateQueue = new Set();
let isFlushing = false;
function enqueueUpdate(comp) {
  updateQueue.add(comp);
  if (!isFlushing) {
    isFlushing = true;
    queueMicrotask(() => {
      updateQueue.forEach((c) => {
        try {
          c.fn();
        } catch (e) {
          console.error("Error in reactive update:", e);
        }
      });
      updateQueue.clear();
      isFlushing = false;
    });
  }
}
export const signal = (initialValue) => {
  const state = {
    value: initialValue,
  };
  const subscribers = new Set();
  const get = () => {
    if (currentComputation) {
      subscribers.add(currentComputation);
      currentComputation.deps.add(subscribers);
    }
    return state.value;
  };
  const set = (newValue) => {
    if (Object.is(newValue, state.value)) return;

    if (typeof newValue === "function") {
      const newValue1 = newValue(state.value);
      state.value = newValue1;
    } else {
      state.value = newValue;
    }

    subscribers.forEach(enqueueUpdate);
  };
  return [get, set];
};
export const createElement = (tag, props, children = []) => {
  const element = document.createElement(tag);

  const key = props.key;
  delete props.key;
  if (key != null) element._key = key;

  Object.entries(props).forEach(([key, value]) => {
    if (key.startsWith("on") === true && typeof value === "function") {
      const [, eventName] = key.split("on");
      element.addEventListener(eventName.toLowerCase(), value);
    } else if (key === "class") {
      const attach = () => {
        const classArray = (typeof value === "string" ? value : value())
          .trim()
          .replace(/\s+/g, " ")
          .split(" ")
          .filter((name) => name.trim().length > 0);
        const desiredClasses = new Set(classArray);
        Array.from(element.classList).forEach((className) => {
          if (desiredClasses.has(className) === false) {
            element.classList.remove(className);
          }
        });
        desiredClasses.forEach((className) => {
          element.classList.add(className);
        });
      };
      if (typeof value === "function") {
        subscribe(() => {
          attach();
        });
      } else {
        attach();
      }
    } else if (key === "style") {
      const attach = () => {
        Object.entries(typeof value === "object" ? value : value()).forEach(([key, val]) => {
          const cssProp = key.replace(/([A-Z])/g, "-$1").toLowerCase();
          const current = element.style.getPropertyValue(cssProp);
          if (val === null || val === undefined || val === false) {
            if (current) {
              element.style.removeProperty(cssProp);
            }
          } else {
            const newVal = String(val);
            if (current !== newVal) {
              element.style.setProperty(cssProp, newVal);
            }
          }
        });
      };
      if (typeof value === "object") {
        attach();
      } else if (typeof value === "function") {
        subscribe(() => {
          attach();
        });
      }
    } else {
      if (typeof value === "function") {
        subscribe(() => {
          element.setAttribute(key, value());
        });
      } else {
        element.setAttribute(key, value);
      }
    }
  });

  const appendChildRecursive = (child) => {
    if (child === null || child === undefined) return;

    if (typeof child === "function") {
      const placeholder = document.createComment("dynamic-child");
      element.appendChild(placeholder);

      let nodeCache = new Map();
      let mountedNodes = [];

      const render = () => {
        const value = child();

        if (value !== undefined) {
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
        }
      };

      subscribe(render);
      return;
    }

    if (Array.isArray(child)) {
      child.forEach(appendChildRecursive);
      return;
    }

    if (child instanceof Node) {
      element.appendChild(child);
      return;
    }

    element.appendChild(document.createTextNode(child));
  };
  children.forEach(appendChildRecursive);
  return element;
};

export function useEffect(callback, dependencies) {
  let prevValues = [];
  let isInitialRun = true;
  const reactiveFunction = () => {
    const currentValues = dependencies.map((dep) => dep());
    if (!isInitialRun) {
      const dependenciesChanged = currentValues.some((current, i) => !Object.is(current, prevValues[i]));
      if (!dependenciesChanged) {
        return;
      }
    }
    callback();
    prevValues = currentValues;
    isInitialRun = false;
  };
  subscribe(reactiveFunction);
}
