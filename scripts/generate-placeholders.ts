import { ensurePlaceholderTemplates } from "../src/lib/ensurePlaceholderTemplates";

async function main() {
  await ensurePlaceholderTemplates();
  console.log("Premium template preview backgrounds generated.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
