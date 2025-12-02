type Computation = {
  fn: () => void;
  deps: Set<Set<Computation>>;
};

let currentComputation: Computation | null = null;

const subscribe = (fn: () => void) => {
  const computation: Computation = {
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

const cleanup = (computation: Computation) => {
  computation.deps.forEach((depSet) => depSet.delete(computation));
  computation.deps.clear();
};

const updateQueue = new Set<Computation>();
let isFlushing = false;

const enqueueUpdate = (comp: Computation) => {
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

type Updater<T> = (currentValue: T) => T;

export const signal = <T>(initialValue: T): [() => T, (value: T | ((currentValue: T) => T)) => void] => {
  const state: { value: T } = { value: initialValue };
  const subscribers = new Set<Computation>();

  const get = (): T => {
    if (currentComputation) {
      subscribers.add(currentComputation);
      currentComputation.deps.add(subscribers);
    }
    return state.value;
  };

  const set = (newValue: T | ((currentValue: T) => T)) => {
    if (Object.is(newValue, state.value) === false) {
      if (typeof newValue === "function") {
        state.value = (newValue as Updater<T>)(state.value);
      } else {
        state.value = newValue;
      }
    }

    subscribers.forEach(enqueueUpdate);
  };

  return [get, set];
};

type ElementChild = string | number | boolean | HTMLElement | (() => ElementChild) | (() => ElementChild[]);

type StyleObject = {
  [K in keyof CSSStyleDeclaration]?: CSSStyleDeclaration[K] | string | number | null | undefined;
};

type ElementProps<T extends keyof HTMLElementTagNameMap> = Omit<Partial<HTMLElementTagNameMap[T]>, "style"> & {
  style?: StyleObject | (() => StyleObject);
  className?: string | (() => string);
  "data-key"?: string;
} & Record<string, any>;

export const createElement = <T extends keyof HTMLElementTagNameMap>(tag: T, props: ElementProps<T>, children: ElementChild[] = []) => {
  const element = document.createElement(tag);

  const key = props.key;
  delete props.key;

  if (key !== null && key !== undefined) {
    // @ts-ignore
    element._key = key;
  }

  Object.entries(props).forEach(([key, value]) => {
    if (key.startsWith("on") === true && typeof value === "function") {
      const [, eventName] = key.split("on");

      element.addEventListener(eventName.toLowerCase(), value);
    } else if (key === "class") {
      const attach = () => {
        const classArray: string[] = (typeof value === "string" ? value : value())
          .trim()
          .replace(/\s+/g, " ")
          .split(" ")
          .filter((name: string) => name.trim().length > 0);

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

  const appendChildRecursive = (child: ElementChild) => {
    if (child == null) return;

    if (typeof child === "function") {
      const nodeOrElementOrArray = child();

      if (Array.isArray(nodeOrElementOrArray)) {
        const placeholder = document.createTextNode("");
        element.appendChild(placeholder);

        let nodeCache = new Map();
        let mountedNodes: (HTMLElement | Text)[] = [];

        subscribe(() => {
          const newCandidates = nodeOrElementOrArray.map((val) => {
            if (val instanceof Node) return val;
            return document.createTextNode(String(val));
          });

          const nextNodeCache = new Map();
          const finalNodes: (HTMLElement | Text)[] = [];

          newCandidates.forEach((candidate) => {
            // @ts-ignore
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

          let currentRef: HTMLElement | Text = placeholder;

          finalNodes.forEach((node) => {
            if (currentRef.nextSibling !== node) {
              currentRef.after(node);
            }
            currentRef = node;
          });

          mountedNodes = finalNodes;
          nodeCache = nextNodeCache;
        });
      } else if (nodeOrElementOrArray instanceof HTMLElement || nodeOrElementOrArray instanceof Text) {
        element.appendChild(nodeOrElementOrArray);
      } else {
        const textNode = document.createTextNode(String(nodeOrElementOrArray));
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

type SignalGetter<T> = () => T;

export const useEffect = (callback: () => void, dependencies: SignalGetter<any>[]) => {
  let prevValues: any[] = [];

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

export const useFetch = <T>(callback: () => Promise<T>) => {
  const [getReturn, setReturn] = signal<[string, null | T]>(["pending", null]);

  (async () => {
    const response = await callback();

    setReturn(["resolved", response]);
  })();

  return getReturn;
};
