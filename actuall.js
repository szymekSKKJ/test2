(function () {
  function patchMethod(proto, methodName, type) {
    if (!proto || !proto[methodName]) return;
    const original = proto[methodName];
    proto[methodName] = function (...args) {
      args.forEach((node) => {
        if (node !== null && node._createElement === true) {
          if (type === "mount") {
            if (node._onMount !== undefined && typeof node._onMount === "function") {
              node._onMount(node);
            }
          }

          // if (type === "unmount") {
          //   if (this._onUnmount !== undefined && typeof this._onUnmount === "function") {
          //     this.onUnmount(this);
          //   }
          // }
        }
      });

      if (this !== null && this._createElement === true) {
        // if (type === "mount") {
        //   if (this._onMount !== undefined && typeof this._onMount === "function") {
        //     this._onMount(this);
        //   }
        // }

        if (type === "unmount") {
          if (this._onUnmount !== undefined && typeof this._onUnmount === "function") {
            this._onUnmount(this);
          }
        }
      }
      return original.apply(this, args);
    };
  }
  patchMethod(Node.prototype, "appendChild", "mount");
  patchMethod(Node.prototype, "insertBefore", "mount");
  patchMethod(Node.prototype, "replaceChild", "mount");
  patchMethod(Node.prototype, "removeChild", "unmount");
  patchMethod(Node.prototype, "after", "mount");
  patchMethod(Text.prototype, "remove", "unmount");
  patchMethod(Text.prototype, "after", "mount");
  patchMethod(Element.prototype, "remove", "unmount");
  patchMethod(Element.prototype, "prepend", "mount");
  patchMethod(Element.prototype, "append", "mount");
  patchMethod(Element.prototype, "after", "mount");
})();
let currentComputation = null;
const subscribe = (fn) => {
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
};
const cleanup = (computation) => {
  computation.deps.forEach((depSet) => depSet.delete(computation));
  computation.deps.clear();
};
const updateQueue = new Set();
let isFlushing = false;
const enqueueUpdate = (comp) => {
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
};
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
    if (Object.is(newValue, state.value) === false) {
      if (typeof newValue === "function") {
        state.value = newValue(state.value);
      } else {
        state.value = newValue;
      }
    }
    subscribers.forEach(enqueueUpdate);
  };
  return [get, set];
};
export const createElement = (tag, props, children = []) => {
  const element = document.createElement(tag);
  const key = props.key;
  delete props.key;
  if (key !== null && key !== undefined) {
    // @ts-ignore
    element._key = key;
  }

  // @ts-ignore
  element._createElement = true;
  Object.entries(props).forEach(([key, value]) => {
    if (key === "onMount") {
      element._onMount = value;
    } else if (key === "onUnmount") {
      element._onUnmount = value;
    } else if (key.startsWith("on") === true && typeof value === "function") {
      const [, eventName] = key.split("on");
      element.addEventListener(eventName.toLowerCase(), value);
    } else if (key === "class") {
      const attach = () => {
        const classArray = (typeof value === "string" ? value : value(element))
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
        Object.entries(typeof value === "object" ? value : value(element)).forEach(([key, val]) => {
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
    } else if (key === "ref" && typeof value === "function") {
      value(element);
    } else {
      if (typeof value === "function") {
        subscribe(() => {
          element.setAttribute(key, value(element));
        });
      } else {
        element.setAttribute(key, value);
      }
    }
  });
  const appendChildRecursive = (child) => {
    if (child === null || child === undefined) return;
    if (typeof child === "function") {
      const placeholder = document.createTextNode("");
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
            // @ts-ignore
            const candidateKey = candidate._key;
            if (candidateKey !== null && candidateKey !== undefined) {
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
    element.appendChild(document.createTextNode(String(child)));
  };
  children.forEach(appendChildRecursive);
  return element;
};
export const useEffect = (callback, dependencies) => {
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
};
export const useFetch = (callback) => {
  const [getReturn, setReturn] = signal(["pending", null]);
  (async () => {
    const response = await callback();
    setReturn(["resolved", response]);
  })();
  return getReturn;
};
export const useRef = (initialValue = null) => {
  // const [getValue, setValue] = signal(initialValue);

  // const target = {
  //   current: initialValue,
  //   _currentGet
  // };

  // const proxy = new Proxy(target, {
  //   get(value, prop) {
  //     console.log(value);
  //     getValue();
  //     return value;
  //   },
  //   set(obj, prop, value) {
  //     setValue(value);
  //     return {
  //       current: value,
  //     };
  //   },
  // });

  return { current: initialValue };
};
