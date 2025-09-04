import fs from 'fs';
import path from 'path';

import { createEmbeddingFunction } from '@/utils/embeddings';
import { logger } from '@/utils/logger';

import type { OpenAIEmbeddingFunction } from '@chroma-core/openai';

export interface IntentEmbeddings {
  [key: string]: number[];
}

export class IntentEmbeddingsService {
  private embeddings: IntentEmbeddings | null = null;
  private readonly embeddingFunction: OpenAIEmbeddingFunction;

  constructor() {
    this.embeddingFunction = createEmbeddingFunction();
  }

  /**
   * Initialize intent embeddings
   */
  public async initialize(): Promise<void> {
    if (this.embeddings) {
      return;
    }

    try {
      this.embeddings = await this.generateIntentEmbeddings();
    } catch (error) {
      logger.error('Failed to initialize intent embeddings:', error);
      throw error;
    }
  }

  /**
   * Load existing intent embeddings from JSON file
   */
  public async loadIntentEmbeddings(): Promise<IntentEmbeddings> {
    const filePath = path.join(process.cwd(), 'intentEmbeddings.json');

    try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      const embeddings = JSON.parse(data);
      return embeddings;
    } catch (error) {
      logger.error('Error loading intent embeddings:', error);
      throw error;
    }
  }

  /**
   * Get the loaded embeddings
   */
  public getEmbeddings(): IntentEmbeddings | null {
    return this.embeddings;
  }

  /**
   * Generate embeddings for intent categories
   */
  private async generateIntentEmbeddings(): Promise<IntentEmbeddings> {
    const categories: Record<string, string[]> = {
      resume: [
        'Show me your resume',
        'Do you have a resume?',
        'Tell me about your work history',
        'What jobs have you had?',
        'Where did you go to school?',
        'What companies have you worked at?',
        'List your past experience',
        'What is your career background?',
        'Tell me your job titles',
        'Summarize your professional history',
      ],
      faq: [
        'What is your name?',
        'Where do you live?',
        'What is your favorite food?',
        'How old are you?',
        'What are your hobbies?',
        'What do you do for fun?',
        'What languages do you speak?',
        'What are your strengths?',
        'What is your favorite book?',
        'What is your favorite movie?',
      ],
      blog: [
        'Show me your blog posts',
        'Do you have a blog?',
        'What articles have you written?',
        'Where can I read your writing?',
        'Can I see some essays?',
        'Do you publish online?',
        "Share something you've written",
        'What topics do you write about?',
        'Do you keep a journal?',
        'Can I read your published work?',
      ],
    };

    const intentEmbeddings: IntentEmbeddings = {};

    for (const [key, phrases] of Object.entries(categories)) {
      logger.info(`Generating intent embeddings for category: ${key}`);
      const embeddings = await this.embeddingFunction.generate(phrases);
      intentEmbeddings[key] = embeddings;
    }

    // Save to JSON file
    const filePath = path.join(process.cwd(), 'intentEmbeddings.json');
    try {
      await fs.promises.access(filePath);
      logger.info('🗑️ Deleting existing intent embeddings file');
      await fs.promises.unlink(filePath);
    } catch {
      // File doesn't exist, which is fine
    }
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(intentEmbeddings, null, 2),
    );
    logger.info('✅ Saved intent embeddings file');

    return intentEmbeddings;
  }
}
