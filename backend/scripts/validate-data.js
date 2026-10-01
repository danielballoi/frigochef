// Controlla l'archivio ricette e il vocabolario: npm run validate:data
import { readDataFiles } from '../src/recipes/recipeRepository.js';
import { validateData } from '../src/recipes/validateData.js';

const data = await readDataFiles();
const errors = validateData(data);

if (errors.length > 0) {
  console.error(`Archivio non valido (${errors.length} errori):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Archivio valido: ${data.recipes.length} ricette, ${data.vocabulary.length} ingredienti nel vocabolario.`);
