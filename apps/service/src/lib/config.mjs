import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const serviceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(serviceDir, '..', '..', '..', '..');

export function resolveServiceConfig(overrides = {}) {
  const host = overrides.host ?? process.env.NEXUS_HOST ?? '127.0.0.1';
  const port = Number(overrides.port ?? process.env.NEXUS_PORT ?? 43100);
  const dataDir = overrides.dataDir ?? process.env.NEXUS_DATA_DIR ?? join(repoRoot, 'runtime');
  const bootstrapPath = overrides.bootstrapPath ?? join(repoRoot, 'config', 'internal-bootstrap.json');
  const staticDir = overrides.staticDir ?? join(repoRoot, 'apps', 'web', 'public');
  const storageMode = overrides.storageMode ?? process.env.NEXUS_STORAGE_MODE ?? 'json';
  const libraryConnectionString = overrides.libraryConnectionString ?? process.env.NEXUS_LIBRARY_CONNECTION_STRING ?? '';
  const libraryChatbaseSchema = overrides.libraryChatbaseSchema ?? process.env.NEXUS_LIBRARY_CHATBASE_SCHEMA ?? 'nexus_chatbase';
  const libraryMetabaseSchema = overrides.libraryMetabaseSchema ?? process.env.NEXUS_LIBRARY_METABASE_SCHEMA ?? 'nexus_metabase';

  return {
    repoRoot,
    host,
    port,
    dataDir,
    bootstrapPath,
    staticDir,
    storageMode,
    libraryConnectionString,
    libraryChatbaseSchema,
    libraryMetabaseSchema
  };
}
