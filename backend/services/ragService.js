
import { financialKnowledge } from "../data/financialKnowledge.js";

const stopWords = new Set([
  "the", "a", "an", "is", "are", "was", "what", "why", "how",
  "does", "do", "and", "or", "to", "of", "in", "for", "on",
  "it", "my", "this", "that", "with", "me", "explain"
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

export function retrieveKnowledge(question, limit = 3) {
  const queryWords = new Set(tokenize(question));

  return financialKnowledge
    .map((document) => {
      const searchableText =
        `${document.title} ${document.content} ${document.id}`;

      const documentWords = tokenize(searchableText);
      const score = documentWords.reduce(
        (total, word) => total + (queryWords.has(word) ? 1 : 0),
        0
      );

      return { ...document, score };
    })
    .filter((document) => document.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
