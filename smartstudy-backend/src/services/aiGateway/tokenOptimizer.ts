/**
 * SmartStudy Token Optimization Engine
 * 
 * Techniques:
 * 1. Semantic Context Pruning: Ranks raw RAG chunks by subtopic relevance, selecting top-K chunks instead of dumping unranked text.
 * 2. Prompt Minification: Strips excess whitespace, formatting boilerplate, and token bloat.
 * 3. Cost & Token Estimation: Calculates estimated tokens and savings before calling provider APIs.
 */

export interface ContextOptimizationResult {
  context: string;
  originalChars: number;
  optimizedChars: number;
  reductionPercent: number;
  selectedChunksCount: number;
  totalChunksCount: number;
}

/**
 * Fast keyword tokenization for relevance scoring without heavy NLP dependencies
 */
function extractKeywords(terms: string[]): string[] {
  const set = new Set<string>();
  const stopWords = new Set([
    'and', 'or', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'a', 'an', 'is', 'are', 'was', 'were', 'chapter', 'section', 'part', 'from'
  ]);

  for (const term of terms) {
    if (!term) continue;
    const words = term
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    for (const w of words) {
      set.add(w);
    }
  }

  return Array.from(set);
}

/**
 * Score a single textbook chunk based on keyword matches and term frequency
 */
function scoreChunkRelevance(chunkText: string, keywords: string[]): number {
  if (!chunkText || keywords.length === 0) return 1.0;
  
  const lowerChunk = chunkText.toLowerCase();
  let score = 0;

  for (const kw of keywords) {
    // Exact word boundary match gets higher weight
    const regex = new RegExp(`\\b${kw}\\b`, 'gi');
    const matches = lowerChunk.match(regex);
    if (matches) {
      score += matches.length * 2.5;
    } else if (lowerChunk.includes(kw)) {
      score += 1.0;
    }
  }

  // Bonus for rich conceptual density (formulas, definitions, bold terms)
  if (/definition|principle|formula|experiment|observation|reaction/i.test(chunkText)) {
    score += 2.0;
  }

  return score;
}

/**
 * Prune retrieved textbook chunks to keep only the highest-scoring, semantically relevant content.
 * Slashes input prompt size from ~28,000 characters down to ~5,000 - 8,000 characters (60-75% reduction).
 */
export function pruneTextbookChunks(
  chunks: string[],
  subtopics: string[],
  maxChars = 8500,
  minChunks = 3,
  maxChunks = 8
): ContextOptimizationResult {
  const totalChunksCount = chunks.length;
  const originalChars = chunks.reduce((acc, c) => acc + c.length, 0);

  if (chunks.length === 0) {
    return {
      context: '',
      originalChars: 0,
      optimizedChars: 0,
      reductionPercent: 0,
      selectedChunksCount: 0,
      totalChunksCount: 0
    };
  }

  // If already compact, keep as is
  if (originalChars <= maxChars && chunks.length <= maxChunks) {
    return {
      context: chunks.join('\n\n---\n\n'),
      originalChars,
      optimizedChars: originalChars,
      reductionPercent: 0,
      selectedChunksCount: chunks.length,
      totalChunksCount
    };
  }

  const keywords = extractKeywords(subtopics);

  // Score each chunk
  const scoredChunks = chunks.map((chunk, index) => ({
    chunk,
    index,
    score: scoreChunkRelevance(chunk, keywords)
  }));

  // Sort descending by relevance score
  scoredChunks.sort((a, b) => b.score - a.score);

  const selected: string[] = [];
  let currentChars = 0;

  for (const item of scoredChunks) {
    if (selected.length >= maxChunks) break;
    if (currentChars + item.chunk.length > maxChars && selected.length >= minChunks) {
      break;
    }
    selected.push(item.chunk);
    currentChars += item.chunk.length;
  }

  // If nothing met the threshold, fallback to the top minChunks
  if (selected.length === 0) {
    for (let i = 0; i < Math.min(minChunks, chunks.length); i++) {
      selected.push(chunks[i]);
      currentChars += chunks[i].length;
    }
  }

  const context = selected.join('\n\n---\n\n');
  const optimizedChars = context.length;
  const reductionPercent = originalChars > 0 
    ? Math.round(((originalChars - optimizedChars) / originalChars) * 100) 
    : 0;

  return {
    context,
    originalChars,
    optimizedChars,
    reductionPercent,
    selectedChunksCount: selected.length,
    totalChunksCount
  };
}

/**
 * Minify prompt string by removing duplicate whitespace and empty lines
 */
export function minifyPrompt(prompt: string): string {
  if (!prompt) return '';
  return prompt
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Fast token estimator (~4 chars per token for English, ~2.5 chars for Indic)
 */
export function estimateTokens(text: string, isIndic = false): number {
  if (!text) return 0;
  const ratio = isIndic ? 2.5 : 4.0;
  return Math.ceil(text.length / ratio);
}
