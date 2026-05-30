import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'CtrlEm DB by Strateg',
        namespace: 'https://ctrlem.local/userscripts',
        version: '1.1.0',
        description: 'Adds DB shortcuts and a DB manager to CtrlEm command pages.',
        match: ['https://ctrlem.com/*'],
        grant: ['GM_addStyle', 'GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', 'GM_download', 'GM_openInTab'],
        // "*" is still needed because user-saved media URLs can point at arbitrary hosts.
        connect: [
          'ctrlem.com',
          'api.imgbb.com',
          'i.ibb.co',
          'catbox.moe',
          'files.catbox.moe',
          'upload.vidhosting.in',
          'stream.vidhosting.in',
          '*',
        ],
        'run-at': 'document-idle',
      },
      build: {
        fileName: 'ctrlem-db.user.js',
        metaFileName: false,
        autoGrant: false,
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
