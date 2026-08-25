import ReactDOM from 'react-dom/client';
import './style.css';
import { createCompanionUiStore } from '../../companion/companion-ui';
import {
  createExtensionRuntime,
  DEFAULT_BACKEND_URL,
} from '../../runtime/extension-runtime';
import App from './App';

const mockPortalMatches = [
  'http://localhost:5173/*',
  'http://127.0.0.1:5173/*',
];

export default defineContentScript({
  matches: mockPortalMatches,
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'voice-companion-root',
      position: 'overlay',
      anchor: 'body',
      onMount(container) {
        const app = document.createElement('div');
        app.dataset.voiceCompanionApp = 'true';
        container.append(app);

        const store = createCompanionUiStore(app);
        const runtime = createExtensionRuntime({
          companion: store,
          backendUrl: DEFAULT_BACKEND_URL,
        });
        runtime.start();
        const reactMount = document.createElement('div');
        app.append(reactMount);

        const root = ReactDOM.createRoot(reactMount);
        root.render(<App store={store} />);
        return { root, store, runtime };
      },
      onRemove(mounted) {
        mounted?.runtime.stop();
        mounted?.root.unmount();
        mounted?.store.destroy();
      },
    });

    ui.mount();
  },
});
