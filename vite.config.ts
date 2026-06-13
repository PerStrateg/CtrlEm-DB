import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'CtrlEm DB by Strateg',
        namespace: 'https://discord.com/channels/1465036592262676601/1505167683107160156',
        version: '1.3.1',
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
        license: 'MIT'
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
