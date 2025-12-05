import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ExtractedName {
  name: string;
  type: 'person' | 'place';
}

export async function extractNames(verseText: string, previousVerse?: string): Promise<ExtractedName[]> {
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

     Notas adicionales:
     - Mantén los acentos y la forma en que aparecen los nombres en el texto original.
     - Elimina duplicados dentro del mismo versículo.
     - Clasifica correctamente: personas son individuos humanos, lugares son ubicaciones geográficas.
     - Si se proporciona contexto del versículo anterior, úsalo para entender mejor si un nombre es persona o lugar, pero SOLO extrae nombres del versículo actual.
     - En genealogías ("X engendró a Y"), los nombres son PERSONAS, incluso si terminan en "-im" (sufijo hebreo de plural/descendencia). Ejemplos: Ludim, Anamim, Lehabim, Naftuhim, Patrusim, Casluhim, Caftorim son PERSONAS (patriarcas de clanes), NO gentilicios.
     - Un gentilicio describe a habitantes actuales de un lugar (ej: "los egipcios dijeron"). Un patriarca/ancestro es una PERSONA que da origen a un pueblo.${contextSection}
    `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: verseText }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
    });

    const content = response.choices[0].message.content;
    console.log('[OpenAI] Input:', verseText);
    console.log('[OpenAI] Previous verse context:', previousVerse || 'none');
    console.log('[OpenAI] Response:', content);
    if (!content) return [];

    const parsed = JSON.parse(content);
    console.log('[OpenAI] Parsed names:', parsed.names);
    return parsed.names || [];
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    throw error;
  }
}
