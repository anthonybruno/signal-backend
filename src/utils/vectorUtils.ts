/**
 * Compute the cosine similarity between two embedding vectors.
 */
export function cosineSimilarity(
  a: number[] | number[][],
  b: number[] | number[][],
): number {
  const vecA = Array.isArray(a[0]) ? (a as number[][])[0] : (a as number[]);
  const vecB = Array.isArray(b[0]) ? (b as number[][])[0] : (b as number[]);

  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be the same length');
  }

  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
