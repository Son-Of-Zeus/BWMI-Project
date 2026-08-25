import ReactDOM from 'react-dom/client';
import './style.css';
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

        const root = ReactDOM.createRoot(app);
        root.render(<App />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
