import fs from 'fs';
import path from 'path';

const BIBLE_DATA_DIR = path.join(process.cwd(), 'public', 'bible_data');

export interface Book {
  testament: string;
  title: string;
  shortTitle: string;
  abbr: string;
  category: string;
  key: string;
  number: number;
  chapters: number;
  verses: number;
}

const EXCLUDED_BOOKS = [
  '1_juan', '2_juan', 'proverbios', 'eclesiastes', 'lamentaciones',
  'nahum', 'habacuc', 'joel', 'abdias', 'sofonias', 'hageo',
  'malaquias', 'efesios'
];

export function getBooks(): Book[] {
  const indexData = fs.readFileSync(path.join(BIBLE_DATA_DIR, '_index.json'), 'utf-8');
  const books: Book[] = JSON.parse(indexData);
  
  return books.filter(book => !EXCLUDED_BOOKS.includes(book.key));
}

export function getVerseText(bookKey: string, chapter: number, verse: number): string | null {
  try {
    const bookPath = path.join(BIBLE_DATA_DIR, `${bookKey}.json`);
    if (!fs.existsSync(bookPath)) return null;
    
    const bookData = JSON.parse(fs.readFileSync(bookPath, 'utf-8'));
    // chapters are 0-indexed in the array, but 1-indexed in the request
    // verses are 0-indexed in the array, but 1-indexed in the request
    const chapterData = bookData[chapter - 1];
    if (!chapterData) return null;
    
    const verseText = chapterData[verse - 1];
    return verseText || null;
  } catch (error) {
    console.error(`Error reading verse ${bookKey} ${chapter}:${verse}`, error);
    return null;
  }
}

export function getVerseCount(bookKey: string, chapter: number): number {
  try {
    const bookPath = path.join(BIBLE_DATA_DIR, `${bookKey}.json`);
    if (!fs.existsSync(bookPath)) return 0;
    
    const bookData = JSON.parse(fs.readFileSync(bookPath, 'utf-8'));
    const chapterData = bookData[chapter - 1];
    return chapterData ? chapterData.length : 0;
  } catch (error) {
    console.error(`Error reading verse count for ${bookKey} chapter ${chapter}`, error);
    return 0;
  }
}

export function getChapterContent(bookKey: string, chapter: number): { verse: number; text: string }[] {
  try {
    const bookPath = path.join(BIBLE_DATA_DIR, `${bookKey}.json`);
    if (!fs.existsSync(bookPath)) return [];
    
    const bookData = JSON.parse(fs.readFileSync(bookPath, 'utf-8'));
    const chapterData = bookData[chapter - 1];
    if (!chapterData) return [];
    
    return chapterData.map((text: string, index: number) => ({
      verse: index + 1,
      text
    }));
  } catch (error) {
    console.error(`Error reading chapter ${bookKey} ${chapter}`, error);
    return [];
  }
}
