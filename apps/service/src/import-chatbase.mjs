import { importChatbaseIntoNexus } from './lib/chatbase-import.mjs';

async function main() {
  const summary = await importChatbaseIntoNexus();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
