import { defineConfig } from 'wxt';

const mockPortalMatches = ['http://localhost/*', 'http://127.0.0.1/*'];

export default defineConfig({
  manifest: ({ mode }) => ({
    name:
      mode === 'development'
        ? 'Voice-Native Public-Service Companion (Dev)'
        : 'Voice-Native Public-Service Companion',
    description: 'Voice and visual guidance for public-service websites.',
    version: '0.1.0',
    host_permissions: mockPortalMatches,
    action: {
      default_title: 'Voice Companion',
    },
  }),
});
