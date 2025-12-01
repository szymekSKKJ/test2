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
    state.value = newValue;
    subscribers.forEach(enqueueUpdate);
  };
  return [get, set];
};
export const createElement = (tag, props, children = []) => {
  const element = document.createElement(tag);
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
    if (child == null) return;
    if (typeof child === "function") {
      const nodeOrEl = child();
      if (nodeOrEl instanceof HTMLElement || nodeOrEl instanceof Text) {
        element.appendChild(nodeOrEl);
      } else {
        const textNode = document.createTextNode(String(nodeOrEl));
        element.appendChild(textNode);
        subscribe(() => {
          const next = child();
          textNode.textContent = String(next);
        });
      }
    } else if (child instanceof Node) {
      element.appendChild(child);
    } else {
      element.appendChild(document.createTextNode(String(child)));
    }
  };
  children.forEach(appendChildRecursive);
  return element;
};

export function useRffect(callback, dependencies) {
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
