import ReactDOM from 'react-dom/client';

import Companion from '../companion/Companion';
import {
  createCompanionUiStore,
  type CompanionUiStore,
} from '../companion/companion-ui';
import type { AudioRecorder } from '../voice/voice';
import {
  createExtensionRuntime,
  DEFAULT_BACKEND_URL,
  type ExtensionRuntime,
} from './extension-runtime';

export const EMBEDDED_COMPANION_HOST_STYLE = [
  'position: fixed',
  'inset: 0',
  'width: 0',
  'height: 0',
  'overflow: visible',
  'z-index: 2147483644',
  'pointer-events: none',
].join(';');

export type EmbeddedCompanionMountOptions = {
  document?: Document;
  backendUrl?: string;
  styleText?: string;
  recorder?: AudioRecorder;
};

export type EmbeddedCompanionMount = {
  host: HTMLDivElement;
  shadowRoot: ShadowRoot;
  store: CompanionUiStore;
  runtime: ExtensionRuntime;
  destroy(): void;
};

export function normalizeEmbeddedBackendUrl(
  value: unknown,
  fallback = DEFAULT_BACKEND_URL,
): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().replace(/\/+$/, '');
  return normalized || fallback;
}

function createEmbeddedHost(documentNode: Document): HTMLDivElement {
  if (!documentNode.body) {
    throw new Error('The voice companion requires a document body.');
  }

  const host = documentNode.createElement('div');
  host.style.cssText = EMBEDDED_COMPANION_HOST_STYLE;
  documentNode.body.append(host);
  return host;
}

function appendStyle(shadowRoot: ShadowRoot, styleText?: string): void {
  if (!styleText) {
    return;
  }

  const style = shadowRoot.ownerDocument.createElement('style');
  style.textContent = styleText;
  shadowRoot.append(style);
}

export function mountEmbeddedCompanion(
  options: EmbeddedCompanionMountOptions = {},
): EmbeddedCompanionMount {
  const documentNode = options.document ?? document;
  const host = createEmbeddedHost(documentNode);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  appendStyle(shadowRoot, options.styleText);

  const app = documentNode.createElement('div');
  app.style.cssText = [
    'position: fixed',
    'inset: 0',
    'pointer-events: none',
    'overflow: visible',
  ].join(';');
  app.dataset.voiceCompanionApp = 'true';
  shadowRoot.append(app);

  const store = createCompanionUiStore(app);
  const runtime = createExtensionRuntime({
    document: documentNode,
    companion: store,
    backendUrl: normalizeEmbeddedBackendUrl(options.backendUrl),
    recorder: options.recorder,
  });
  const reactMount = documentNode.createElement('div');
  app.append(reactMount);

  const root = ReactDOM.createRoot(reactMount);
  root.render(<Companion store={store} />);
  runtime.start();

  let destroyed = false;
  return {
    host,
    shadowRoot,
    store,
    runtime,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      runtime.stop();
      root.unmount();
      store.destroy();
      host.remove();
    },
  };
}
