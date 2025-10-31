import axios from 'axios';

export const getEmbedding = async (chunks) => {
  const embeddings = [];

  for (const chunk of chunks) {
    const response = await axios.post('http://localhost:11434/api/embeddings', {
      model: 'nomic-embed-text',
      prompt: chunk, // single string per request
    });

    embeddings.push({
      chunk,
      vector: response.data.embedding,
    });
  }

  return embeddings;
};
