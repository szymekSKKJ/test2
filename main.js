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

const createSignal = (initialValue) => {
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

const useEffect = (effect, deps) => {
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

const createElement = (tagName, props = {}, children = []) => {
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

  const appendChildRecursive = (child) => {
    if (Array.isArray(child)) {
      child.forEach(appendChildRecursive);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else if (typeof child === "function") {
      const textNode = document.createTextNode("");
      subscribe(() => (textNode.textContent = child()));
      el.appendChild(textNode);
    } else {
      el.appendChild(document.createTextNode(child));
    }
  };

  children.forEach(appendChildRecursive);

  return el;
};

const [getCount, setCount] = createSignal(0);
const [getCount1, setCount1] = createSignal(0);

useEffect(() => {
  console.log("Count or color changed:", getCount(), getCount1());

  return () => {
    console.log("Cleaning up effect");
  };
}, [getCount1, getCount]);

const p = createElement(
  "p",
  {
    onClick: () => {
      setCount(getCount() + 1);
    },
    style: {
      padding: () => {
        return `${getCount() * 5}px`;
      },
    },
  },
  [() => `count ${getCount()}`]
);

document.body.appendChild(p);
