import ReactDOM from 'react-dom/client';
import './style.css';
import { createCompanionUiStore } from '../../companion/companion-ui';
import App from './App';

const mockPortalMatches = ['http://localhost/*', 'http://127.0.0.1/*'];

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
        const reactMount = document.createElement('div');
        app.append(reactMount);

        const root = ReactDOM.createRoot(reactMount);
        root.render(<App store={store} />);
        return { root, store };
      },
      onRemove(mounted) {
        mounted?.root.unmount();
        mounted?.store.destroy();
      },
    });

    ui.mount();
  },
});
