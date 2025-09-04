/**
 * Utility for handling response streaming
 */

export class StreamingUtils {
  /**
   * Streams a response with artificial delays
   * @param response - The complete response to stream
   * @param onChunk - Callback function called for each chunk
   */
  static async streamResponse(
    response: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    for (let i = 0; i < response.length; i += 120) {
      const chunk = response.slice(i, i + 120);
      onChunk(chunk);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
