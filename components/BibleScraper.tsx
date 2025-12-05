'use client'

import { useState, useEffect, useRef } from 'react';
import { getBooksList, processVerse, reprocessVerse, getExtractedNames, getVersesForName, getUsageStats, getChapterStats, getBookStats, getFullChapterContent, deleteName } from '@/app/actions';
import { Book } from '@/lib/bible';

// Token thresholds
const TOKEN_WARNING_THRESHOLD = 2_300_000;  // 2.3M - show warning
const TOKEN_LIMIT_THRESHOLD = 2_500_000;    // 2.5M - stop all processing

interface ChapterStats {
  total: number;
  processed: number;
  processedVerses: number[];
  percentage: number;
}

interface BookStats {
  total: number;
  processed: number;
  percentage: number;
  chapters: Array<{
    chapter: number;
    total: number;
    processed: number;
    percentage: number;
  }>;
}

interface VerseData {
  verse: number;
  text: string;
}

interface ExtractedName {
  name: string;
  type: 'person' | 'place';
}

interface VerseStatus {
  processed: boolean;
  names: ExtractedName[];
}

export default function BibleScraper() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<number>(0);
  
  const [chaptersCount, setChaptersCount] = useState<number>(0);
  
  // Chapter content
  const [chapterVerses, setChapterVerses] = useState<VerseData[]>([]);
  const [verseStatuses, setVerseStatuses] = useState<Record<number, VerseStatus>>({});
  const [loadingChapter, setLoadingChapter] = useState<boolean>(false);
  
  // Processing state
  const [processingVerse, setProcessingVerse] = useState<number | null>(null);
  const [reprocessingVerse, setReprocessingVerse] = useState<number | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [isBookProcessing, setIsBookProcessing] = useState<boolean>(false);
  const [bookProgress, setBookProgress] = useState<{ currentChapter: number; totalChapters: number; currentVerse: number; totalVerses: number }>({ currentChapter: 0, totalChapters: 0, currentVerse: 0, totalVerses: 0 });
  
  // Stats
  const [bookStats, setBookStats] = useState<Record<string, BookStats>>({});
  const [chapterStats, setChapterStats] = useState<ChapterStats | null>(null);
  
  // Name explorer
  const [allNames, setAllNames] = useState<ExtractedName[]>([]);
  const [nameFilter, setNameFilter] = useState<string>('');
  const [selectedName, setSelectedName] = useState<string>('');
  const [nameReferences, setNameReferences] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  
  // Usage
  const [usageStats, setUsageStats] = useState<any>(null);
  const [usageLoading, setUsageLoading] = useState<boolean>(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [processedCount, setProcessedCount] = useState<number>(0);

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getBooksList().then(books => {
      setBooks(books);
      if (books.length > 0) {
        setSelectedBook(books[0].key);
      }
    });
    // load names (objects with type) and usage
    getExtractedNames().then((list) => setAllNames(list as ExtractedName[]));
    updateUsage();
  }, []);

  const updateUsage = async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const u = await getUsageStats();
      if ((u as any)?.error) {
        setUsageError((u as any).error);
      }
      setUsageStats(u);
    } catch (e) {
      console.error('Error updating usage', e);
      setUsageError('No se pudo actualizar usage');
    }
    setUsageLoading(false);
  };

  // Token limit helpers
  const getCurrentTokens = (): number => {
    return usageStats?.total_tokens || 0;
  };

  const isAtWarningThreshold = (): boolean => {
    const tokens = getCurrentTokens();
    return tokens >= TOKEN_WARNING_THRESHOLD && tokens < TOKEN_LIMIT_THRESHOLD;
  };

  const isAtLimitThreshold = (): boolean => {
    return getCurrentTokens() >= TOKEN_LIMIT_THRESHOLD;
  };

  const canProcess = (): boolean => {
    return !isAtLimitThreshold();
  };

  const mergeNames = (newEntries: ExtractedName[] | undefined) => {
    if (!newEntries || newEntries.length === 0) return;
    setAllNames(prev => {
      const map = new Map<string, ExtractedName>();
      for (const e of prev) map.set(`${e.name}||${e.type}`, e);
      for (const e of newEntries) map.set(`${e.name}||${e.type}`, e);
      const merged = Array.from(map.values());
        merged.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      return merged;
    });
  };

  useEffect(() => {
    if (selectedBook) {
      const book = books.find(b => b.key === selectedBook);
      setChaptersCount(book ? book.chapters : 0);
      setSelectedChapter(1);
      loadBookStats(selectedBook);
    }
  }, [selectedBook, books]);

  useEffect(() => {
    if (selectedBook && selectedChapter > 0) {
      loadChapterContent();
    }
  }, [selectedBook, selectedChapter]);

  const loadBookStats = async (bookKey: string) => {
    const stats = await getBookStats(bookKey);
    setBookStats(prev => ({ ...prev, [bookKey]: stats }));
  };

  const loadChapterContent = async () => {
    if (!selectedBook || !selectedChapter) return;
    setLoadingChapter(true);
    try {
      const { verses, processedStatus } = await getFullChapterContent(selectedBook, selectedChapter);
      setChapterVerses(verses);
      setVerseStatuses(processedStatus);
      
      const stats = await getChapterStats(selectedBook, selectedChapter);
      setChapterStats(stats);
    } finally {
      setLoadingChapter(false);
    }
  };

  const handleProcessVerse = async (verseNum: number) => {
    if (processingVerse || isBatchProcessing || isBookProcessing || !canProcess()) return;
    setProcessingVerse(verseNum);
    try {
      const result = await processVerse(selectedBook, selectedChapter, verseNum);
      setVerseStatuses(prev => ({
        ...prev,
        [verseNum]: { processed: true, names: result.names }
      }));

      // merge names into sidebar immediately to simulate realtime
      mergeNames(result.names as ExtractedName[]);

      if (!result.alreadyProcessed) {
        setProcessedCount(prev => {
          const newCount = prev + 1;
          if (newCount % 10 === 0) updateUsage();
          return newCount;
        });
      }

      // refresh the chapter display
      loadChapterContent();
    } finally {
      setProcessingVerse(null);
    }
  };

  const handleReprocessVerse = async (verseNum: number) => {
    if (processingVerse || reprocessingVerse || isBatchProcessing || isBookProcessing || !canProcess()) return;
    setReprocessingVerse(verseNum);
    try {
      const result = await reprocessVerse(selectedBook, selectedChapter, verseNum);
      setVerseStatuses(prev => ({
        ...prev,
        [verseNum]: { processed: true, names: result.names as ExtractedName[] }
      }));

      // Refresh all names to ensure consistency
      const allNamesRefresh = await getExtractedNames();
      setAllNames(allNamesRefresh as ExtractedName[]);
      
      updateUsage();
      loadChapterContent();
    } finally {
      setReprocessingVerse(null);
    }
  };

  const handleBatchProcess = async () => {
    if (isBatchProcessing || !selectedBook || !selectedChapter || !canProcess()) return;
    
    const unprocessedVerses = chapterVerses.filter(v => !verseStatuses[v.verse]?.processed);
    if (unprocessedVerses.length === 0) return;
    
    setIsBatchProcessing(true);
    setBatchProgress({ current: 0, total: unprocessedVerses.length });
    
    let localProcessedCount = processedCount;
    let stoppedByLimit = false;
    
    for (let i = 0; i < unprocessedVerses.length; i++) {
      // Check token limit before each verse
      if (isAtLimitThreshold()) {
        stoppedByLimit = true;
        break;
      }
      
      const v = unprocessedVerses[i];
      try {
        const result = await processVerse(selectedBook, selectedChapter, v.verse);
        setVerseStatuses(prev => ({
          ...prev,
          [v.verse]: { processed: true, names: result.names }
        }));
        
        // merge names into sidebar in realtime
        mergeNames(result.names as ExtractedName[]);

        if (!result.alreadyProcessed) {
          localProcessedCount++;
          if (localProcessedCount % 10 === 0) {
            await updateUsage();
          }
        }
      } catch (error) {
        console.error(`Error processing verse ${v.verse}:`, error);
      }
      setBatchProgress({ current: i + 1, total: unprocessedVerses.length });
    }
    
    setProcessedCount(localProcessedCount);
    setIsBatchProcessing(false);
    if (stoppedByLimit) {
      await updateUsage();
      alert('⚠️ Procesamiento detenido: se alcanzó el límite de 2.5M tokens.');
    }
    getExtractedNames().then((list) => setAllNames(list as ExtractedName[]));
    updateUsage();
    loadChapterContent();
    loadBookStats(selectedBook);
  };

  const handleBookProcess = async () => {
    if (isBookProcessing || isBatchProcessing || !selectedBook || !canProcess()) return;
    
    const book = books.find(b => b.key === selectedBook);
    if (!book) return;
    
    setIsBookProcessing(true);
    setBookProgress({ currentChapter: 0, totalChapters: book.chapters, currentVerse: 0, totalVerses: 0 });
    
    let localProcessedCount = processedCount;
    let stoppedByLimit = false;
    
    outerLoop:
    for (let chap = 1; chap <= book.chapters; chap++) {
      // Check token limit before each chapter
      if (isAtLimitThreshold()) {
        stoppedByLimit = true;
        break;
      }
      
      setBookProgress(prev => ({ ...prev, currentChapter: chap }));
      
      // Switch to current chapter being processed for real-time visualization
      setSelectedChapter(chap);
      
      // Load chapter content
      const { verses, processedStatus } = await getFullChapterContent(selectedBook, chap);
      
      // Update UI with this chapter's content
      setChapterVerses(verses);
      setVerseStatuses(processedStatus);
      
      const unprocessedVerses = verses.filter(v => !processedStatus[v.verse]?.processed);
      
      if (unprocessedVerses.length === 0) {
        // Update chapter stats even if nothing to process
        const stats = await getChapterStats(selectedBook, chap);
        setChapterStats(stats);
        continue;
      }
      
      setBookProgress(prev => ({ ...prev, currentVerse: 0, totalVerses: unprocessedVerses.length }));
      
      for (let i = 0; i < unprocessedVerses.length; i++) {
        // Check token limit before each verse
        if (isAtLimitThreshold()) {
          stoppedByLimit = true;
          break outerLoop;
        }
        
        const v = unprocessedVerses[i];
        try {
          const result = await processVerse(selectedBook, chap, v.verse);
          
          // Update verse status in real-time (same as batch process)
          setVerseStatuses(prev => ({
            ...prev,
            [v.verse]: { processed: true, names: result.names as ExtractedName[] }
          }));
          
          // merge names into sidebar in realtime
          mergeNames(result.names as ExtractedName[]);
          
          if (!result.alreadyProcessed) {
            localProcessedCount++;
            if (localProcessedCount % 10 === 0) {
              await updateUsage();
            }
          }
        } catch (error) {
          console.error(`Error processing ${selectedBook} ${chap}:${v.verse}:`, error);
        }
        setBookProgress(prev => ({ ...prev, currentVerse: i + 1 }));
      }
      
      // Update chapter stats after processing
      const stats = await getChapterStats(selectedBook, chap);
      setChapterStats(stats);
      
      // Refresh book stats after each chapter
      await loadBookStats(selectedBook);
    }
    
    setProcessedCount(localProcessedCount);
    setIsBookProcessing(false);
    if (stoppedByLimit) {
      await updateUsage();
      alert('⚠️ Procesamiento detenido: se alcanzó el límite de 2.5M tokens.');
    }
    getExtractedNames().then((list) => setAllNames(list as ExtractedName[]));
    updateUsage();
    loadBookStats(selectedBook);
  };

  const handleNameSelect = async (name: string) => {
    setSelectedName(name);
    if (name) {
      const refs = await getVersesForName(name);
      setNameReferences(refs);
    } else {
      setNameReferences([]);
    }
  };

  const handleDeleteName = async (name: string) => {
    setDeleting(true);
    try {
      await deleteName(name);
      setAllNames(prev => prev.filter(n => n.name !== name));
      if (selectedName === name) {
        setSelectedName('');
        setNameReferences([]);
      }
      setDeleteConfirm(null);
      // Reload chapter content to update the verse displays
      loadChapterContent();
    } catch (error) {
      console.error('Error deleting name:', error);
      alert('Error al eliminar el nombre');
    } finally {
      setDeleting(false);
    }
  };

  const getBookPercentage = (bookKey: string) => {
    return bookStats[bookKey]?.percentage || 0;
  };

  const getChapterPercentage = (chapterNum: number) => {
    const stats = bookStats[selectedBook]?.chapters?.find(c => c.chapter === chapterNum);
    return stats?.percentage || 0;
  };

  const filteredNames = nameFilter
    ? allNames.filter(entry => entry.name.toLowerCase().includes(nameFilter.trim().toLowerCase()))
    : allNames;

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span className="text-2xl">📖</span>
          Extractor de Nombres Bíblicos
        </h1>
        <div className="flex items-center gap-4 text-xs">
          {usageLoading ? (
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg text-slate-600">
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Actualizando...
            </div>
          ) : usageError ? (
            <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg text-red-700 border border-red-200">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              {usageError}
            </div>
          ) : usageStats && !usageStats.error && (
            <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg ${
              isAtLimitThreshold() 
                ? 'bg-red-100 border border-red-300' 
                : isAtWarningThreshold() 
                ? 'bg-amber-100 border border-amber-300' 
                : 'bg-slate-100'
            }`}>
              {isAtLimitThreshold() && (
                <span className="text-red-600 font-bold flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                  </svg>
                  LÍMITE
                </span>
              )}
              {isAtWarningThreshold() && (
                <span className="text-amber-600 font-bold flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                  AVISO
                </span>
              )}
              <span className="text-slate-500">Tokens:</span>
              <span className={`font-mono font-bold ${
                isAtLimitThreshold() ? 'text-red-600' : isAtWarningThreshold() ? 'text-amber-600' : 'text-emerald-600'
              }`}>{usageStats.total_tokens?.toLocaleString() || 0}</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">Requests:</span>
              <span className="font-mono font-bold text-blue-600">{usageStats.requests?.toLocaleString() || 0}</span>
            </div>
          )}
          <button
            onClick={updateUsage}
            className="text-xs bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-60"
            disabled={usageLoading}
            title="Actualizar usage"
          >
            {usageLoading ? 'Actualizando...' : 'Actualizar usage'}
          </button>
        </div>
      </header>

      {/* Main 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Column 1: Books */}
        <div className="w-48 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Libros</h2>
            <button
              onClick={handleBookProcess}
              disabled={isBookProcessing || isBatchProcessing || !selectedBook || getBookPercentage(selectedBook) === 100 || !canProcess()}
              className={`p-1 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${!canProcess() ? 'cursor-not-allowed' : ''}`}
              title={!canProcess() ? 'Límite de tokens alcanzado' : 'Procesar libro completo'}
            >
              <svg className={`w-4 h-4 ${!canProcess() ? 'text-red-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </button>
          </div>
          
          {/* Book processing progress bar */}
          {isBookProcessing && (
            <div className="px-3 py-2 bg-blue-50 border-b border-blue-200">
              <div className="flex items-center gap-2 text-xs text-blue-700">
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span className="font-medium">
                  Cap {bookProgress.currentChapter}/{bookProgress.totalChapters}
                </span>
                {bookProgress.totalVerses > 0 && (
                  <span className="text-blue-500">
                    v{bookProgress.currentVerse}/{bookProgress.totalVerses}
                  </span>
                )}
              </div>
              <div className="mt-1 h-1 bg-blue-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${(bookProgress.currentChapter / bookProgress.totalChapters) * 100}%` }}
                />
              </div>
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto">
            {books.map(book => {
              const pct = getBookPercentage(book.key);
              const isSelected = selectedBook === book.key;
              return (
                <button
                  key={book.key}
                  onClick={() => setSelectedBook(book.key)}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 transition-colors flex items-center justify-between ${
                    isSelected 
                      ? 'bg-blue-600 text-white' 
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="truncate font-medium">{book.shortTitle}</span>
                  <span className={`text-xs font-mono ${
                    isSelected ? 'text-blue-200' :
                    pct === 100 ? 'text-green-600' :
                    pct > 0 ? 'text-amber-600' : 'text-slate-400'
                  }`}>
                    {pct}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 2: Chapters */}
        <div className="w-24 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
            <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Caps</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {Array.from({ length: chaptersCount }, (_, i) => {
              const chap = i + 1;
              const pct = getChapterPercentage(chap);
              const isSelected = selectedChapter === chap;
              const isBeingProcessed = isBookProcessing && bookProgress.currentChapter === chap;
              return (
                <button
                  key={chap}
                  onClick={() => !isBookProcessing && setSelectedChapter(chap)}
                  disabled={isBookProcessing}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 transition-colors flex items-center justify-between ${
                    isBeingProcessed
                      ? 'bg-amber-500 text-white animate-pulse'
                      : isSelected 
                      ? 'bg-purple-600 text-white' 
                      : 'hover:bg-slate-50 text-slate-700 disabled:hover:bg-white'
                  }`}
                >
                  <span className="font-bold flex items-center gap-1">
                    {isBeingProcessed && (
                      <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    )}
                    {chap}
                  </span>
                  <span className={`text-xs font-mono ${
                    isBeingProcessed ? 'text-amber-200' :
                    isSelected ? 'text-purple-200' :
                    pct === 100 ? 'text-green-600' :
                    pct > 0 ? 'text-amber-600' : 'text-slate-400'
                  }`}>
                    {pct}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Column 3: Chapter Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chapter Header */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                {books.find(b => b.key === selectedBook)?.shortTitle} {selectedChapter}
              </h2>
              {chapterStats && (
                <p className="text-xs text-slate-500">
                  {chapterStats.processed}/{chapterStats.total} versículos procesados ({chapterStats.percentage}%)
                </p>
              )}
            </div>
            <button
              onClick={handleBatchProcess}
              disabled={isBatchProcessing || isBookProcessing || loadingChapter || chapterVerses.filter(v => !verseStatuses[v.verse]?.processed).length === 0 || !canProcess()}
              className={`inline-flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !canProcess() 
                  ? 'bg-red-400 cursor-not-allowed' 
                  : 'bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed'
              }`}
              title={!canProcess() ? 'Límite de tokens alcanzado' : 'Procesar todos los versículos'}
            >
              {isBatchProcessing ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  {batchProgress.current}/{batchProgress.total}
                </>
              ) : !canProcess() ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                  </svg>
                  Límite
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  Procesar Todo
                </>
              )}
            </button>
          </div>

          {/* Verses */}
          <div ref={contentRef} className="flex-1 overflow-y-auto p-4 space-y-2">
            {loadingChapter ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full"/>
              </div>
            ) : chapterVerses.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                Selecciona un libro y capítulo
              </div>
            ) : (
              chapterVerses.map(v => {
                const status = verseStatuses[v.verse];
                const isProcessed = status?.processed;
                const isProcessing = processingVerse === v.verse;
                const names = status?.names || [];
                
                return (
                  <div
                    key={v.verse}
                    className={`rounded-lg border-2 transition-all ${
                      isProcessing
                        ? 'bg-yellow-50 border-yellow-400 shadow-lg'
                        : isProcessed
                        ? 'bg-green-50 border-green-300'
                        : 'bg-white border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Verse number & status */}
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            isProcessing
                              ? 'bg-yellow-500 text-white animate-pulse'
                              : isProcessed
                              ? 'bg-green-500 text-white'
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {v.verse}
                          </span>
                          {isProcessed && (
                            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                            </svg>
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 leading-relaxed">{v.text}</p>
                          
                          {/* Names extracted */}
                          {names.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {names.map((entry, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${
                                    entry.type === 'place'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {entry.type === 'place' ? (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                                    </svg>
                                  ) : (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                                    </svg>
                                  )}
                                  {entry.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {/* Action buttons */}
                        <div className="flex flex-col gap-1 shrink-0">
                          {!isProcessed && !isBatchProcessing && !isBookProcessing && (
                            <button
                              onClick={() => handleProcessVerse(v.verse)}
                              disabled={isProcessing || !canProcess()}
                              className={`p-2 rounded-lg text-white transition-colors ${
                                !canProcess() 
                                  ? 'bg-red-400 cursor-not-allowed' 
                                  : 'bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300'
                              }`}
                              title={!canProcess() ? 'Límite de tokens alcanzado' : 'Procesar versículo'}
                            >
                              {isProcessing ? (
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                </svg>
                              ) : !canProcess() ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                                </svg>
                              )}
                            </button>
                          )}
                          {isProcessed && !isBatchProcessing && !isBookProcessing && (
                            <button
                              onClick={() => handleReprocessVerse(v.verse)}
                              disabled={reprocessingVerse === v.verse || !canProcess()}
                              className={`p-2 rounded-lg text-white transition-colors ${
                                !canProcess() 
                                  ? 'bg-red-400 cursor-not-allowed' 
                                  : 'bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300'
                              }`}
                              title={!canProcess() ? 'Límite de tokens alcanzado' : 'Reprocesar versículo'}
                            >
                              {reprocessingVerse === v.verse ? (
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                </svg>
                              ) : !canProcess() ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 4: Name Explorer (collapsible sidebar) */}
        <div className="w-72 bg-white border-l border-slate-200 flex flex-col shrink-0">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
            <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Nombres ({filteredNames.length}/{allNames.length})
            </h2>
            <div className="flex gap-2 mt-1 text-[10px]">
              <span className="flex items-center gap-1 text-emerald-600">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
                Personas
              </span>
              <span className="flex items-center gap-1 text-blue-600">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                Lugares
              </span>
            </div>
            <div className="mt-2">
              <input
                type="text"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Filtrar nombres..."
                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {allNames.length === 0 ? (
              <p className="text-slate-400 text-sm p-4 text-center">No hay nombres extraídos aún</p>
            ) : filteredNames.length === 0 ? (
              <p className="text-slate-400 text-sm p-4 text-center">Sin coincidencias para el filtro</p>
            ) : (
              filteredNames.map((entry, idx) => (
                <button
                  key={`${entry.name}-${idx}`}
                  onClick={() => handleNameSelect(entry.name)}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 transition-colors flex items-center gap-2 ${
                    selectedName === entry.name
                      ? entry.type === 'place' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {entry.type === 'place' ? (
                    <svg className={`w-4 h-4 shrink-0 ${selectedName === entry.name ? 'text-white' : 'text-blue-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                  ) : (
                    <svg className={`w-4 h-4 shrink-0 ${selectedName === entry.name ? 'text-white' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                  )}
                  {entry.name}
                </button>
              ))
            )}
          </div>
          
          {/* References */}
          {selectedName && (
            <div className="border-t border-slate-200 bg-slate-50">
              <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-600">
                  Referencias: {selectedName}
                </h3>
                <button
                  onClick={() => setDeleteConfirm(selectedName)}
                  className="p-1 rounded hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors"
                  title="Eliminar nombre"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                {nameReferences.map(ref => (
                  <div key={ref} className="bg-white px-2 py-1.5 rounded text-xs font-mono text-slate-600 border border-slate-200">
                    {ref}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Eliminar nombre</h3>
                <p className="text-sm text-slate-500">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <p className="text-slate-700 mb-6">
              ¿Estás seguro de que deseas eliminar <strong className="text-slate-900">"{deleteConfirm}"</strong> y todas sus referencias ({nameReferences.length})?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteName(deleteConfirm)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Eliminando...
                  </>
                ) : (
                  'Eliminar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
