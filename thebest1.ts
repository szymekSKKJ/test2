type Computation = {
  fn: () => void;
  deps: Set<Set<Computation>>;
};

let currentComputation: Computation | null = null;

function subscribe(fn: () => void) {
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
}

function cleanup(computation: Computation) {
  computation.deps.forEach((depSet) => depSet.delete(computation));
  computation.deps.clear();
}

const updateQueue = new Set<Computation>();
let isFlushing = false;

function enqueueUpdate(comp: Computation) {
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

const signal = <T>(initialValue: T): [() => T, (value: T) => void] => {
  const state: { value: T } = { value: initialValue };
  const subscribers = new Set<Computation>();

  const get = (): T => {
    if (currentComputation) {
      subscribers.add(currentComputation);
      currentComputation.deps.add(subscribers);
    }
    return state.value;
  };

  const set = (newValue: T) => {
    if (Object.is(newValue, state.value)) return;
    state.value = newValue;
    subscribers.forEach(enqueueUpdate);
  };

  return [get, set];
};

type ElementChild = string | number | boolean | HTMLElement | (() => ElementChild);

type StyleObject = {
  [K in keyof CSSStyleDeclaration]?: CSSStyleDeclaration[K] | string | number | null | undefined;
};

type ElementProps<T extends keyof HTMLElementTagNameMap> = Omit<Partial<HTMLElementTagNameMap[T]>, "style"> & {
  style?: StyleObject | (() => StyleObject);
  className?: string | (() => string);
  "data-key"?: string;
} & Record<string, any>;

const createElement = <T extends keyof HTMLElementTagNameMap>(tag: T, props: ElementProps<T>, children: ElementChild[] = []) => {
  const element = document.createElement(tag);

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
      // Reactive child
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

type SignalGetter<T> = () => T;

function useRffect(callback: () => void, dependencies: SignalGetter<any>[]) {
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
}

const [getValue, setValue] = signal(0);
const [getValue1, setValue1] = signal(0);

const [getValues, setValues] = signal([
  {
    id: crypto.randomUUID(),
    value: 0,
  },
  {
    id: crypto.randomUUID(),
    value: 0,
  },
  {
    id: crypto.randomUUID(),
    value: 0,
  },
  {
    id: crypto.randomUUID(),
    value: 0,
  },
]);

useRffect(() => {
  console.log(getValue());
}, [getValue]);

const a = createElement(
  "div",
  {
    onClick: () => {
      setValue(getValue() + 1);
    },
    "data-value": () => {
      return getValue();
    },
  },
  [
    createElement(
      "p",
      {
        style: () => {
          const value = getValue1();

          return {
            fontSize: `${value}px`,
          };
        },
        class: () => {
          const value = getValue();

          return `${value >= 3 && value <= 6 ? "red" : ""}`;
        },
      },
      [
        () => {
          const value = getValue();

          return createElement("p", {}, [
            createElement("span", {}, [
              () => {
                const value = getValue();

                return value;
              },
            ]),
          ]);
        },
      ]
    ),
    createElement(
      "p",
      {
        onClick: () => {
          setValue1(getValue1() + 1);
        },
      },
      [
        () => {
          const value = getValue1();

          return value;

          //   return createElement("p", {}, [value]);

          // return createElement("p", {}, [createElement("span", {}, [value])]);
        },
      ]
    ),
    createElement(
      "div",
      {},
      getValues().map(({ id, value }) => {
        return () => {
          return createElement(
            "div",
            {
              onClick: () => {
                const cloned = [...getValues()];

                const fd = cloned.find((data) => data.id === id);

                fd!.value = fd!.value + 1;

                setValues(cloned);
              },
            },
            [
              createElement(
                "p",
                {
                  class: () => {
                    const current = [...getValues()].find((data) => data.id === id)!;

                    return `${current.value >= 5 ? "red" : ""}`;
                  },
                },
                [
                  () => {
                    const current = [...getValues()].find((data) => data.id === id)!;

                    return current.value;
                  },
                ]
              ),
            ]
          );
        };
      })
    ),
  ]
);
document.body.appendChild(a);
