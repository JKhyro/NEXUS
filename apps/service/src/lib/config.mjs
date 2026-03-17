import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const serviceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(serviceDir, '..', '..', '..', '..');

function loadLocalConfig(configPath) {
  if (!configPath || !existsSync(configPath)) {
    return {};
  }

  return JSON.parse(readFileSync(configPath, 'utf8'));
}

export function resolveServiceConfig(overrides = {}) {
  const configPath = overrides.configPath ?? process.env.NEXUS_CONFIG_PATH ?? join(repoRoot, 'config', 'nexus.local.json');
  const localConfig = loadLocalConfig(configPath);

  const host = overrides.host ?? process.env.NEXUS_HOST ?? localConfig.host ?? '127.0.0.1';
  const port = Number(overrides.port ?? process.env.NEXUS_PORT ?? localConfig.port ?? 43100);
  const dataDir = overrides.dataDir ?? process.env.NEXUS_DATA_DIR ?? localConfig.dataDir ?? join(repoRoot, 'runtime');
  const bootstrapPath = overrides.bootstrapPath ?? localConfig.bootstrapPath ?? join(repoRoot, 'config', 'internal-bootstrap.json');
  const staticDir = overrides.staticDir ?? localConfig.staticDir ?? join(repoRoot, 'apps', 'web', 'public');
  const storageMode = overrides.storageMode ?? process.env.NEXUS_STORAGE_MODE ?? localConfig.storageMode ?? 'json';
  const libraryConnectionString = overrides.libraryConnectionString ?? process.env.NEXUS_LIBRARY_CONNECTION_STRING ?? localConfig.libraryConnectionString ?? '';
  const libraryChatbaseSchema = overrides.libraryChatbaseSchema ?? process.env.NEXUS_LIBRARY_CHATBASE_SCHEMA ?? localConfig.libraryChatbaseSchema ?? 'nexus_chatbase';
  const libraryMetabaseSchema = overrides.libraryMetabaseSchema ?? process.env.NEXUS_LIBRARY_METABASE_SCHEMA ?? localConfig.libraryMetabaseSchema ?? 'nexus_metabase';

  return {
    repoRoot,
    configPath,
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
