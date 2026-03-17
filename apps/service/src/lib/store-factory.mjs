import { LibraryPostgresStore } from './library-postgres-store.mjs';
import { NexusJsonStore } from './store.mjs';

export function createStore(config) {
  if (config.storageMode === 'library-postgres') {
    if (!config.libraryConnectionString) {
      throw new Error('NEXUS_LIBRARY_CONNECTION_STRING is required when NEXUS_STORAGE_MODE=library-postgres.');
    }

    return new LibraryPostgresStore({
      bootstrapPath: config.bootstrapPath,
      connectionString: config.libraryConnectionString,
      chatbaseSchema: config.libraryChatbaseSchema,
      metabaseSchema: config.libraryMetabaseSchema
    });
  }

  return new NexusJsonStore({
    dataDir: config.dataDir,
    bootstrapPath: config.bootstrapPath
  });
}
