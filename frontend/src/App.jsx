import { useCallback, useEffect, useRef, useState } from 'react';
import { getConfig, recognizePhoto, findRecipes } from './api.js';
import { resizeToJpeg } from './image.js';
import { loadPantry, savePantry } from './pantry.js';
import { mergeUnique } from './ingredients.js';
import Header from './components/Header.jsx';
import PhotoStep from './components/PhotoStep.jsx';
import AnalysisStep from './components/AnalysisStep.jsx';
import IngredientsStep from './components/IngredientsStep.jsx';
import RecipesStep from './components/RecipesStep.jsx';
import RecipeDetail from './components/RecipeDetail.jsx';
import PrivacyNote from './components/PrivacyNote.jsx';

// Valori usati finché /api/config non risponde (o se non risponde).
const DEFAULT_CONFIG = {
  maxPhotos: 8,
  maxImageMb: 5,
  pantryDefault: ['sale', 'pepe', "olio d'oliva", 'zucchero', 'pasta', 'riso', 'farina', 'aceto', 'acqua'],
};

let nextShelfId = 1;
const newShelf = () => ({ id: nextShelfId++, status: 'empty', analysis: 'idle', ingredients: [] });

export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [screen, setScreen] = useState('photos');
  const [shelves, setShelvesState] = useState(() => [newShelf()]);
  const shelvesRef = useRef(shelves);
  const [currentShelfId, setCurrentShelfId] = useState(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [pantry, setPantryState] = useState(() => loadPantry());
  const [recipes, setRecipes] = useState({ status: 'idle', list: [], error: null });
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const abortRef = useRef(null);

  const pantryItems = pantry ?? config.pantryDefault;

  // Aggiorna subito anche il riferimento: il ciclo di analisi asincrono
  // deve leggere lo stato più recente senza aspettare il prossimo render.
  const setShelves = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(shelvesRef.current) : updater;
    shelvesRef.current = next;
    setShelvesState(next);
  }, []);

  const updateShelf = useCallback(
    (id, patch) => setShelves((list) => list.map((shelf) => (shelf.id === id ? { ...shelf, ...patch } : shelf))),
    [setShelves],
  );

  useEffect(() => {
    const controller = new AbortController();
    getConfig({ signal: controller.signal })
      .then((value) => setConfig({ ...DEFAULT_CONFIG, ...value }))
      .catch(() => {
        // Se il backend non risponde si usano i valori predefiniti.
      });
    return () => controller.abort();
  }, []);

  // ---- Foto ----

  const addShelf = () => {
    setShelves((list) => (list.length >= config.maxPhotos ? list : [...list, newShelf()]));
  };

  const removeShelf = (id) => {
    setShelves((list) => {
      const shelf = list.find((item) => item.id === id);
      if (shelf?.previewUrl) URL.revokeObjectURL(shelf.previewUrl);
      const rest = list.filter((item) => item.id !== id);
      return rest.length > 0 ? rest : [newShelf()];
    });
  };

  const pickPhoto = async (id, file) => {
    if (!file) return;
    const old = shelvesRef.current.find((shelf) => shelf.id === id);
    if (old?.previewUrl) URL.revokeObjectURL(old.previewUrl);
    updateShelf(id, { status: 'processing', error: null, blob: null, previewUrl: null, analysis: 'idle', ingredients: [] });
    try {
      const blob = await resizeToJpeg(file);
      if (blob.size > config.maxImageMb * 1024 * 1024) {
        throw new Error(`Foto troppo grande anche dopo la riduzione (massimo ${config.maxImageMb} MB).`);
      }
      updateShelf(id, { status: 'ready', blob, previewUrl: URL.createObjectURL(blob) });
    } catch (err) {
      updateShelf(id, { status: 'error', error: err.message });
    }
  };

  // ---- Analisi: una foto alla volta ----

  const finishAnalysis = useCallback(() => {
    const list = shelvesRef.current.filter((shelf) => shelf.status === 'ready');
    const merged = mergeUnique(...list.filter((s) => s.analysis === 'done').map((s) => s.ingredients));
    setIngredients((current) => mergeUnique(current, merged));
    if (list.every((shelf) => shelf.analysis === 'done')) {
      setScreen('ingredients');
    }
  }, []);

  const analyze = useCallback(
    async (ids) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setAnalysisRunning(true);
      for (const id of ids) updateShelf(id, { analysis: 'pending', analysisError: null });

      for (const id of ids) {
        if (controller.signal.aborted) return;
        const shelf = shelvesRef.current.find((item) => item.id === id);
        if (!shelf?.blob) continue;
        setCurrentShelfId(id);
        updateShelf(id, { analysis: 'running' });
        try {
          const result = await recognizePhoto(shelf.blob, { signal: controller.signal });
          updateShelf(id, { analysis: 'done', ingredients: result.ingredients ?? [] });
        } catch (err) {
          if (controller.signal.aborted) return;
          updateShelf(id, { analysis: 'failed', analysisError: err.message });
        }
      }

      if (controller.signal.aborted) return;
      setCurrentShelfId(null);
      setAnalysisRunning(false);
      finishAnalysis();
    },
    [updateShelf, finishAnalysis],
  );

  const startAnalysis = () => {
    const ids = shelvesRef.current.filter((shelf) => shelf.status === 'ready').map((shelf) => shelf.id);
    if (ids.length === 0) return;
    setIngredients([]);
    setScreen('analysis');
    analyze(ids);
  };

  const retryShelf = (id) => analyze([id]);
  const retryAllFailed = () =>
    analyze(shelvesRef.current.filter((shelf) => shelf.analysis === 'failed').map((shelf) => shelf.id));

  // ---- Ingredienti e dispensa ----

  const addIngredient = (name) => setIngredients((list) => mergeUnique(list, [name]));
  const removeIngredient = (name) => setIngredients((list) => list.filter((item) => item !== name));

  const changePantry = (items) => {
    setPantryState(items);
    savePantry(items);
  };

  // ---- Ricette ----

  const searchRecipes = async () => {
    setScreen('recipes');
    setRecipes({ status: 'loading', list: [], error: null });
    try {
      const result = await findRecipes(ingredients, pantryItems);
      setRecipes({ status: 'done', list: result.recipes, error: null });
    } catch (err) {
      setRecipes({ status: 'error', list: [], error: err.message });
    }
  };

  const openRecipe = (recipe) => {
    setSelectedRecipe(recipe);
    setScreen('detail');
    try {
      window.scrollTo(0, 0);
    } catch {
      // non disponibile in alcuni ambienti (es. test)
    }
  };

  // ---- Nuova foto: si riparte da capo ----

  const reset = () => {
    abortRef.current?.abort();
    for (const shelf of shelvesRef.current) {
      if (shelf.previewUrl) URL.revokeObjectURL(shelf.previewUrl);
    }
    setShelves([newShelf()]);
    setIngredients([]);
    setRecipes({ status: 'idle', list: [], error: null });
    setSelectedRecipe(null);
    setCurrentShelfId(null);
    setAnalysisRunning(false);
    setScreen('photos');
  };

  const pristine = screen === 'photos' && shelves.length === 1 && shelves[0].status === 'empty';

  return (
    <div className="app">
      <Header onReset={reset} showReset={!pristine} />
      <main className="content" id="contenuto">
        {screen === 'photos' && (
          <PhotoStep
            shelves={shelves}
            maxPhotos={config.maxPhotos}
            onAdd={addShelf}
            onPick={pickPhoto}
            onRemove={removeShelf}
            onAnalyze={startAnalysis}
            onManual={() => setScreen('ingredients')}
          />
        )}
        {screen === 'analysis' && (
          <AnalysisStep
            shelves={shelves.filter((shelf) => shelf.status === 'ready')}
            currentShelfId={currentShelfId}
            running={analysisRunning}
            onRetry={retryShelf}
            onRetryAll={retryAllFailed}
            onContinue={() => setScreen('ingredients')}
          />
        )}
        {screen === 'ingredients' && (
          <IngredientsStep
            ingredients={ingredients}
            onAdd={addIngredient}
            onRemove={removeIngredient}
            pantry={pantryItems}
            pantryDefault={config.pantryDefault}
            onPantryChange={changePantry}
            onSearch={searchRecipes}
            onBackToPhotos={() => setScreen('photos')}
          />
        )}
        {screen === 'recipes' && (
          <RecipesStep
            state={recipes}
            onOpen={openRecipe}
            onRetry={searchRecipes}
            onBack={() => setScreen('ingredients')}
          />
        )}
        {screen === 'detail' && selectedRecipe && (
          <RecipeDetail recipe={selectedRecipe} onBack={() => setScreen('recipes')} />
        )}
      </main>
      <PrivacyNote />
    </div>
  );
}
