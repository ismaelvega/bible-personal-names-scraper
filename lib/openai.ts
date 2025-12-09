import OpenAI from 'openai';

export type LlmProvider = 'openai' | 'gemma';

const activeProvider: LlmProvider =
  (process.env.LLM_PROVIDER?.toLowerCase() as LlmProvider) === 'gemma'
    ? 'gemma'
    : 'openai';

function getClientConfig(provider: LlmProvider) {
  if (provider === 'gemma') {
    const baseURL = process.env.GEMMA_API_BASE_URL;
    if (!baseURL) throw new Error('GEMMA_API_BASE_URL is required when LLM_PROVIDER=gemma');

    // vLLM/ngrok expects an Authorization: Bearer <token>; default to provided key or 'my-secret-key'
    const apiKey = process.env.GEMMA_API_KEY || 'my-secret-key';
    const model = process.env.GEMMA_MODEL || 'google/gemma-3-270m-it';
    const client = new OpenAI({ apiKey, baseURL });

    return { client, model, provider } as const;
  }

  // Default OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  const model = process.env.OPENAI_MODEL || 'gpt-5-nano';
  const client = new OpenAI({ apiKey });

  return { client, model, provider: 'openai' as const };
}

export interface ExtractedName {
  name: string;
  type: 'person' | 'place';
}

export async function extractNames(
  verseText: string,
  previousVerse?: string,
  providerOverride?: LlmProvider
): Promise<ExtractedName[]> {
  const contextSection = previousVerse 
    ? `\n\n    CONTEXTO (versículo anterior, solo para referencia - NO extraer nombres de aquí):\n    "${previousVerse}"\n`
    : '';

    const systemPrompt = `
     Eres un experto en análisis de textos bíblicos. Tu tarea es extraer únicamente los nombres propios de PERSONAS (antropónimos) y LUGARES (topónimos) del versículo proporcionado, indicando el tipo de cada uno.

     Reglas estrictas (aplicar en este orden):
     1) EXCLUIR referencias al Dios único de Israel cuando aparecen como apelativos religiosos reverenciales: Dios, Jehová, Yahvé, Adonai, Señor (cuando se refiere al Dios de Israel) y sus variantes — no extraer estas referencias como nombres propios.
       Sin embargo, EXTRAER nombres de deidades o ídolos paganos mencionados por su nombre (por ejemplo: Baal, Baal-berit, Astarté, Moloc, Quemos, etc.) y clasificarlos como "person" (entidades nombradas), ya que son nombres propios en el texto.
     2) EXCLUIR sustantivos genéricos, conceptos o fenómenos naturales. Ejemplos que deben ser ignorados: cielo, cielos, tierra, tierras, mar, marisma, sol, luna, día, noche, luz, oscuridad, viento, fuego, río, monte (si se usa genéricamente), pueblo (si es común), hombres (cuando no es nombre propio), mujer(es), hijo(s) (como palabra común), nación(es).
     3) EXCLUIR todos los gentilicios (demónimos). Un gentilicio indica procedencia, nacionalidad o pertenencia a un lugar. Ejemplos: cretenses, israelitas, judíos, egipcios, babilonios, caldeos, galileos, samaritanos, filisteos, cananeos, amonitas, moabitas, edomitas, asirios, persas, griegos, romanos, hebreos, levitas, benjaminitas, efrateos, etc. Cualquier palabra que denote "habitantes de" o "pertenecientes a" un lugar debe ser ignorada.
     4) Aceptar nombres de lugares concretos: Jerusalén, Belén, Nazaret, Galilea, Egipto, etc. (marcar como "place")
     5) Aceptar nombres personales (marcar como "person"). Normalizar quitando títulos, prefijos y sufijos:
       - 'Rey David' -> 'David' (person)
       - 'Profeta Isaías' -> 'Isaías' (person)
       - 'San Pablo' -> 'Pablo' (person)
       - 'Juan el Bautista' -> 'Juan' (person)
       - 'Jesús de Nazaret' -> 'Jesús' (person)
     6) Separar nombres compuestos: 'Simón Pedro' -> [{"name": "Simón", "type": "person"}, {"name": "Pedro", "type": "person"}]
     7) Relación patronímica: en 'Agur hijo de Jaqué' extraer ambos como personas.
     8) Evitar falsos positivos: no extraer sustantivos en mayúscula que no sean nombres propios.

     Formato de salida:
     - Devuelve SOLO un JSON con una clave exacta "names" cuyo valor es una lista de objetos.
     - Cada objeto tiene: "name" (string) y "type" ("person" o "place").
     - Ejemplo: {"names": [{"name": "David", "type": "person"}, {"name": "Jerusalén", "type": "place"}]}
     - Si no hay nombres, devuelve: {"names": []}
     - No incluyas ningún texto adicional, explicación, ni comentarios fuera del JSON.

     Ejemplo de salida correcto:
     [OpenAI] Input: Y en cuanto al territorio de los hijos de Efraín por sus familias, el límite de su heredad al lado del oriente fue desde Atarot-adar hasta Bet-horón la de arriba.
    [OpenAI] Previous verse context: Recibieron, pues, su heredad los hijos de José, Manasés y Efraín.
    [OpenAI] Response: {"names": [{"name": "Efraín", "type": "person"}, {"name": "Atarot-adar", "type": "place"}, {"name": "Bet-horón", "type": "place"}]}      
    [OpenAI] Parsed names: [
      { name: 'Efraín', type: 'person' },
      { name: 'Atarot-adar', type: 'place' },
      { name: 'Bet-horón', type: 'place' }
    ]
     Notas adicionales:
     - Mantén los acentos y la forma en que aparecen los nombres en el texto original.
     - Elimina duplicados dentro del mismo versículo.
     - Clasifica correctamente: personas son individuos humanos, lugares son ubicaciones geográficas.
     - Si se proporciona contexto del versículo anterior, úsalo para entender mejor si un nombre es persona o lugar, pero SOLO extrae nombres del versículo actual.
     - En genealogías ("X engendró a Y"), los nombres son PERSONAS, incluso si terminan en "-im" (sufijo hebreo de plural/descendencia). Ejemplos: Ludim, Anamim, Lehabim, Naftuhim, Patrusim, Casluhim, Caftorim son PERSONAS (patriarcas de clanes), NO gentilicios.
     - Un gentilicio describe a habitantes actuales de un lugar (ej: "los egipcios dijeron"). Un patriarca/ancestro es una PERSONA que da origen a un pueblo.${contextSection}

     Reasoning: high
    `;

  try {
    const selectedProvider = providerOverride || activeProvider;
    const { client, model, provider } = getClientConfig(selectedProvider);

    const payload = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: verseText }
      ],
      temperature: 1,
      ...(provider === 'openai' ? { response_format: { type: "json_object" as const } } : {}),
    } satisfies OpenAI.Chat.Completions.ChatCompletionCreateParams;

    const response = await client.chat.completions.create(payload);

    const content = response.choices[0]?.message?.content;
    console.log(`[LLM:${provider}] Input:`, verseText);
    console.log(`[LLM:${provider}] Previous verse context:`, previousVerse || 'none');
    console.log(`[LLM:${provider}] Response:`, content);
    if (!content) return [];

    const parseContent = (raw: string) => {
      const trimmed = raw.trim();
      // Remove triple backtick fences if present
      const fencedMatch = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)```$/);
      const unwrapped = fencedMatch ? fencedMatch[1].trim() : trimmed;
      try {
        return JSON.parse(unwrapped);
      } catch (e) {
        // Try to extract first JSON object substring
        const objMatch = unwrapped.match(/\{[\s\S]*\}/);
        if (objMatch) {
          return JSON.parse(objMatch[0]);
        }
        throw e;
      }
    };

    let parsed: any;
    try {
      parsed = parseContent(content);
    } catch (parseError) {
      console.warn(`[LLM:${provider}] Failed to parse JSON content`, parseError, 'raw:', content);
      return [];
    }

    console.log(`[LLM:${provider}] Parsed names:`, parsed.names);
    return parsed.names || [];
  } catch (error) {
    console.error(`Error calling LLM (${activeProvider}):`, error);
    throw error;
  }
}
