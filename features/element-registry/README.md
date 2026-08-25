# Element Registry

## Goal

Maintain the mapping between model-visible semantic IDs and actual live DOM elements.

The registry is the bridge between reasoning and visual guidance.

## Current Implementation

The extension implementation lives in `apps/extension/registry/element-registry.ts`. It uses a `WeakMap<HTMLElement, string>` for runtime IDs, reconciles discovered elements without persisting coordinates, exposes `getLive()` for stale-target checks, and strips DOM references from `snapshot()` output.

Run the focused tests from `apps/extension/` with:

```sh
npx vitest run registry/element-registry.test.ts
```

## Internal Entry

```ts
export type RegistryEntry = {
  id: string;
  role: string;
  label: string;
  section?: string;
  visible: boolean;
  inViewport: boolean;
  disabled: boolean;
  element: HTMLElement;
};
```

## Model-Safe Entry

```ts
export type SemanticElement = Omit<RegistryEntry, "element">;
```

`HTMLElement` must never be serialized or sent to the backend.

## ID Strategy

Use runtime-generated IDs such as:

```text
el_1
el_2
el_3
```

Use a `WeakMap<HTMLElement, string>` so an element retains its ID while that DOM node remains alive.

Do not rely on website element IDs or CSS selectors as the model-facing identifier.

## Core API

```ts
interface ElementRegistry {
  get(id: string): RegistryEntry | undefined;
  list(): RegistryEntry[];
  snapshot(): SemanticElement[];
  reconcile(next: DiscoveredElement[]): void;
  clear(): void;
}
```

## Reconciliation

When the DOM rescans:

- retain IDs for surviving DOM nodes
- register new nodes
- remove detached nodes
- refresh labels/visibility/disabled state

## Important Rule

Coordinates do not belong in the persistent registry.

The guide controller should call:

```ts
entry.element.getBoundingClientRect()
```

at the moment guidance occurs.

Coordinates become stale after:

- scroll
- resize
- menu expansion
- navigation
- layout shifts

## Stale Target Handling

Before acting on a model-selected target:

```ts
if (!entry || !entry.element.isConnected) {
  rejectAction();
  rescan();
}
```

Never attempt to guide using a stale reference.

## Definition of Done

Given `targetId: "el_17"`, the guide controller can reliably recover the current live `HTMLElement` or safely declare it stale.
