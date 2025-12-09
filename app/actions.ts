'use server'

import { getBooks, getVerseText, getVerseCount, getChapterContent } from '@/lib/bible';
import { extractNames, ExtractedName } from '@/lib/openai';
import db from '@/lib/db';
import { revalidatePath } from 'next/cache';

// Helper function to check if a verse likely contains proper names
function hasProperNamesPotential(text: string): boolean {
  // List of divine references to exclude from capitalization check
  const divineNames = [
    'Dios', 'Jehová', 'Yahvé', 'Adonai', 'Señor', 'SEÑOR',
    'Altísimo', 'Todopoderoso', 'Omnipotente', 'Eterno',
    'Santo', 'Creador', 'Padre', 'Espíritu'
  ];
  
  // Common Spanish words/connectors that appear capitalized due to position, not proper names
  const commonCapitalizedWords = [
    // Conjunciones y conectores
    'Y', 'E', 'O', 'U', 'Pero', 'Mas', 'Sino', 'Aunque', 'Ni', 'Porque', 'Por', 'Pues', 'De',
    // Condicionales y temporales
    'Si', 'Cuando', 'Mientras', 'Antes', 'Después', 'Entonces', 'Luego', 'Hasta', 'Nunca',
    'Siempre', 'Ayer', 'Hoy', 'Mañana',
    // Adverbios
    'Así', 'También', 'Tampoco', 'Ahora', 'Allí', 'Aquí', 'Donde', 'Como', 'Tan', 'Así', 'Aun', 'Aún', 'Cualquiera', 'Nadie',
    // Pronombres y artículos
    'El', 'La', 'Los', 'Las', 'Un', 'Una', 'Unos', 'Unas', 'Él', 'Ella', 'Ellos', 'Ellas', 'Nosotros', 'Nosotras', 'Vosotros', 'Vosotras',
    'Este', 'Esta', 'Estos', 'Estas', 'Ese', 'Esa', 'Esos', 'Esas', 'Aquel', 'Aquella', 'Aquellos', 'Aquellas',
    'Lo', 'Le', 'Les', 'Me', 'Te', 'Se', 'Nos', 'Os',
    'Que', 'Quien', 'Quienes', 'Cual', 'Cuales', 'Cuyo', 'Cuya', 'Cuyos', 'Cuyas',
    // Preposiciones
    'A', 'De', 'En', 'Con', 'Por', 'Para', 'Sin', 'Sobre', 'Tras', 'Bajo', 'Hacia', 'Desde',
    // Verbos auxiliares y comunes en inicio de frase
    'Ha', 'He', 'Han', 'Hay', 'Has',
    'Fue', 'Es', 'Son', 'Era', 'Eran', 'Sea', 'Sean',
    'Está', 'Están', 'Estaba', 'Estaban', 'Esté', 'Estén',
    'Había', 'Habían', 'Haya', 'Hayan', 'Hizo', 'Hicieron', 'Hace', 'Hacen',
    'Haré', 'Harás', 'Hará', 'Haremos', 'Haréis', 'Harán',
    'Habrá', 'Habrán', 'Habremos',
    'Dijo', 'Dijeron', 'Dice', 'Dicen', 'Di', 'Da', 'Dad', 'Den',
    'Ven', 'Ved', 'Vio', 'Vieron', 'Ve', 'Vayan', 'Vaya',
    'Toma', 'Tomad', 'Tomen', 'Tomó', 'Tomaron',
    'Pues', 'Porque', 'Ya', 'Aún', 'Más', 'Menos', 'Mucho', 'Poco', 'Todo', 'Toda', 'Todos', 'Todas',
    'No', 'Sí', 'Tal', 'Vez', 'Bien', 'Mal', 'Según', 'Entre',
    // Imperativos comunes bíblicos
    'Oye', 'Oíd', 'Escucha', 'Escuchad', 'Simplemente', 'Verdaderamente', 'Realmente', 'Ciertamente', 'Mirad', 'Guarda', 'Guardad', 'Guardaréis',
    'Camina', 'Caminad', 'Cree', 'Creed', 'Cread', 'Orad', 'Ora', 'Habla', 'Hablad',
    'Daos', 'Dáos', 'Perdona', 'Perdonad', 'Perdonen', 'Sigue', 'Seguid', 'Busca', 'Buscad',
    'Llama', 'Llamad', 'Lleven', 'Lleva', 'Ayuda', 'Ayudad', 'Confía', 'Confíad',
    'Levanta', 'Levantad', 'Canta', 'Cantad', 'Bendice', 'Bendecid", "Glorifica", "Glorificad',
    'Ama', 'Amad', 'Teme', 'Temed', 'Honra', 'Honrad', 'Alaba', 'Alabad', 'Tendré', 'Tendrás', 'Tendrá', 'Tendremos', 'Tendréis', 'Tendrán',

    // cuestiones
    'Cuándo', 'Dónde', 'Cómo', 'Por qué', 'Cuál', 'Cuáles', 'Quién', 'Quiénes', 'Qué',

    'Esforzaos', 'Alegraos', 'Regocijaos', 'Gozaos', 'Descansa', 'Descansad', 'Trabaja', 'Trabajad',
    'Vive', 'Vivid', 'Muere', 'Morid', 'Persevera', 'Perseverad', 'Lucha', 'Luchad', 'Resiste', 'Resistid',
    'Sana', 'Sanad', 'Cura', 'Curad', 'Protege', 'Proteged', 'Libera', 'Liberad',
    'Construye', 'Construid', 'Edifica', 'Edificad', 'Siembra', 'Sembrad', 'Cosecha', 'Cosechad',
    'Solamente', 'Simplemente', 'Verdaderamente', 'Realmente', 'Ciertamente',
  ];
  
  // Remove divine references and common capitalized words temporarily for analysis
  let cleanedText = text;

  // Helper to escape regex special chars in words
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Use Unicode-safe word boundaries: no letter before/after
  const removeWordList = (source: string, words: string[]) => {
    let result = source;
    for (const word of words) {
      const escaped = escapeRegex(word);
      const regex = new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'giu');
      result = result.replace(regex, '');
    }
    return result;
  };

  // Remove divine names (Unicode safe)
  cleanedText = removeWordList(cleanedText, divineNames);

  // Remove common capitalized words (Unicode safe)
  cleanedText = removeWordList(cleanedText, commonCapitalizedWords);
  
  // Check if there are ANY remaining capital letters (potential proper names)
  // Use a regex to find any uppercase letter (including accented: ÁÉÍÓÚÑ)
  const hasCapitals = /[A-ZÁÉÍÓÚÑ]/.test(cleanedText);
  
  return hasCapitals;
}

export async function getBooksList() {
  return getBooks();
}

export async function getChapterVersesCount(book: string, chapter: number) {
  return getVerseCount(book, chapter);
}

export async function getVerseContent(book: string, chapter: number, verse: number) {
  return getVerseText(book, chapter, verse);
}

export async function getFullChapterContent(book: string, chapter: number) {
  const verses = getChapterContent(book, chapter);
  const processedStatus: Record<number, { processed: boolean; names: Array<{ name: string; type: 'person' | 'place' }> }> = {};
  
  for (const v of verses) {
    const verseRef = `${book}-${chapter}-${v.verse}-rv1960`;
    const existing = db.prepare('SELECT * FROM processed_verses WHERE id = ?').get(verseRef);
    const names = db.prepare('SELECT name, type FROM extracted_names WHERE verse_reference = ?').all(verseRef);
    processedStatus[v.verse] = {
      processed: !!existing,
      names: names.map((n: any) => ({ name: n.name, type: (n.type || 'person') as 'person' | 'place' }))
    };
  }
  
  return { verses, processedStatus };
}

export async function checkProcessed(book: string, chapter: number, verse: number) {
  const verseRef = `${book}-${chapter}-${verse}-rv1960`;
  const existing = db.prepare('SELECT * FROM processed_verses WHERE id = ?').get(verseRef);
  return !!existing;
}

export async function processVerse(
  book: string,
  chapter: number,
  verse: number,
  provider?: 'openai' | 'gemma'
) {
  const verseRef = `${book}-${chapter}-${verse}-rv1960`;
  
  // Check if already processed
  const existing = db.prepare('SELECT * FROM processed_verses WHERE id = ?').get(verseRef);
  if (existing) {
    // Get names for this verse
    const names = db.prepare('SELECT name, type FROM extracted_names WHERE verse_reference = ?').all(verseRef);
    return { 
      processed: true, 
      names: names.map((n: any) => ({ name: n.name, type: n.type || 'person' })),
      alreadyProcessed: true 
    };
  }

  // Get text
  const text = getVerseText(book, chapter, verse);
  if (!text) throw new Error("Verse not found");

  // Check if verse has potential for proper names
  if (!hasProperNamesPotential(text)) {
    // Mark as processed but skip LLM call (no names to extract)
    const insertVerse = db.prepare('INSERT INTO processed_verses (id, processed_at) VALUES (?, ?)');
    insertVerse.run(verseRef, new Date().toISOString());
    
    console.log(`[Skip] Verse ${verseRef}: no proper names detected (no LLM call)`);
    revalidatePath('/');
    return { processed: true, names: [], alreadyProcessed: false, skipped: true };
  }

  // Get previous verse for context (if exists)
  let previousVerse: string | undefined;
  if (verse > 1) {
    previousVerse = getVerseText(book, chapter, verse - 1) || undefined;
  }

  // Extract names with context
  const extractedNames = await extractNames(text, previousVerse, provider);

  // Save to DB
  const insertVerse = db.prepare('INSERT INTO processed_verses (id, processed_at) VALUES (?, ?)');
  const insertName = db.prepare('INSERT INTO extracted_names (name, type, verse_reference) VALUES (?, ?, ?)');

  const transaction = db.transaction(() => {
    insertVerse.run(verseRef, new Date().toISOString());
    for (const entry of extractedNames) {
      insertName.run(entry.name, entry.type, verseRef);
    }
  });

  transaction();
  
  revalidatePath('/'); 
  return { processed: true, names: extractedNames, alreadyProcessed: false, skipped: false };
}

export async function reprocessVerse(
  book: string,
  chapter: number,
  verse: number,
  provider?: 'openai' | 'gemma'
) {
  const verseRef = `${book}-${chapter}-${verse}-rv1960`;
  
  // Delete existing data for this verse
  const deleteNames = db.prepare('DELETE FROM extracted_names WHERE verse_reference = ?');
  const deleteVerse = db.prepare('DELETE FROM processed_verses WHERE id = ?');
  
  db.transaction(() => {
    deleteNames.run(verseRef);
    deleteVerse.run(verseRef);
  })();
  
  // Get text
  const text = getVerseText(book, chapter, verse);
  if (!text) throw new Error("Verse not found");

  // Check if verse has potential for proper names
  if (!hasProperNamesPotential(text)) {
    // Mark as processed but skip LLM call (no names to extract)
    const insertVerse = db.prepare('INSERT INTO processed_verses (id, processed_at) VALUES (?, ?)');
    insertVerse.run(verseRef, new Date().toISOString());
    
    console.log(`[Skip] Reprocess ${verseRef}: no proper names detected (no LLM call)`);
    revalidatePath('/');
    return { processed: true, names: [], skipped: true };
  }

  // Get previous verse for context (if exists)
  let previousVerse: string | undefined;
  if (verse > 1) {
    previousVerse = getVerseText(book, chapter, verse - 1) || undefined;
  }

  // Extract names with context
  const extractedNames = await extractNames(text, previousVerse, provider);

  // Save to DB
  const insertVerse = db.prepare('INSERT INTO processed_verses (id, processed_at) VALUES (?, ?)');
  const insertName = db.prepare('INSERT INTO extracted_names (name, type, verse_reference) VALUES (?, ?, ?)');

  db.transaction(() => {
    insertVerse.run(verseRef, new Date().toISOString());
    for (const entry of extractedNames) {
      insertName.run(entry.name, entry.type, verseRef);
    }
  })();
  
  revalidatePath('/'); 
  return { processed: true, names: extractedNames, skipped: false };
}

export async function getExtractedNames() {
  const names = db.prepare('SELECT DISTINCT name, type FROM extracted_names ORDER BY type, name').all();
  return names.map((n: any) => ({ name: n.name, type: n.type || 'person' }));
}

export async function getVersesForName(name: string) {
  const results = db.prepare('SELECT verse_reference FROM extracted_names WHERE name = ?').all(name);
  return results.map((r: any) => r.verse_reference);
}

export async function deleteName(name: string) {
  const deleteStmt = db.prepare('DELETE FROM extracted_names WHERE name = ?');
  const result = deleteStmt.run(name);
  revalidatePath('/');
  return { deleted: result.changes > 0, count: result.changes };
}

export async function getChapterStats(book: string, chapter: number) {
  const totalVerses = getVerseCount(book, chapter);
  const processedVerses: number[] = [];
  
  for (let v = 1; v <= totalVerses; v++) {
    const verseRef = `${book}-${chapter}-${v}-rv1960`;
    const existing = db.prepare('SELECT * FROM processed_verses WHERE id = ?').get(verseRef);
    if (existing) {
      processedVerses.push(v);
    }
  }
  
  return {
    total: totalVerses,
    processed: processedVerses.length,
    processedVerses,
    percentage: totalVerses > 0 ? Math.round((processedVerses.length / totalVerses) * 100) : 0
  };
}

export async function getBookStats(bookKey: string) {
  const books = getBooks();
  const book = books.find(b => b.key === bookKey);
  if (!book) return { total: 0, processed: 0, percentage: 0, chapters: [] };
  
  const chapterStats = [];
  let totalProcessed = 0;
  
  for (let c = 1; c <= book.chapters; c++) {
    const stats = await getChapterStats(bookKey, c);
    chapterStats.push({
      chapter: c,
      ...stats
    });
    totalProcessed += stats.processed;
  }
  
  return {
    total: book.verses,
    processed: totalProcessed,
    percentage: book.verses > 0 ? Math.round((totalProcessed / book.verses) * 100) : 0,
    chapters: chapterStats
  };
}

export async function getUsageStats() {
    try {
        // Get start of today (midnight UTC)
        const now = new Date();
        const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const startTime = Math.floor(startOfDay.getTime() / 1000);
        
        const url = `https://api.openai.com/v1/organization/usage/completions?start_time=${startTime}&limit=10`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_ADMIN_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Usage API error:", response.status, errorText);
            return { error: `API Error: ${response.status}`, details: errorText };
        }
        
        const data = await response.json();
        
        // Aggregate totals from all buckets
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalRequests = 0;
        
        if (data.data) {
            for (const bucket of data.data) {
                if (bucket.results) {
                    for (const result of bucket.results) {
                        totalInputTokens += result.input_tokens || 0;
                        totalOutputTokens += result.output_tokens || 0;
                        totalRequests += result.num_model_requests || 0;
                    }
                }
            }
        }

        console.log("Usage data fetched:", {
            date: startOfDay.toISOString().split('T')[0],
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            total_tokens: totalInputTokens + totalOutputTokens,
            requests: totalRequests,
            raw: JSON.stringify(data)
        });
        
        return {
            date: startOfDay.toISOString().split('T')[0],
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            total_tokens: totalInputTokens + totalOutputTokens,
            requests: totalRequests,
            raw: data
        };
    } catch (e) {
        console.error("Error fetching usage", e);
        return { error: String(e) };
    }
}
