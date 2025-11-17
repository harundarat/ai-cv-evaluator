import { GoogleGenAI, GenerateContentParameters } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Retry } from './retry.decorator';
import { PDF_RETRY_CONFIG, TEXT_RETRY_CONFIG } from './retry.config';

type LLMCallParameters = Omit<GenerateContentParameters, 'model'>;

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private gemini: GoogleGenAI;

  constructor(private readonly configService: ConfigService) {
    this.gemini = new GoogleGenAI({
      apiKey: this.configService.getOrThrow<string>('GOOGLE_GEMINI_API_KEY'),
    });
  }

  /**
   * Calls Gemini Flash Lite model with PDF input
   * Used for CV and Project Report evaluation (multimodal PDF processing)
   *
   * Retry configuration: PDF_RETRY_CONFIG
   * - Max retries: 4
   * - Initial delay: 1000ms
   * - Timeout: 90s (PDF processing is slower)
   *
   * @param pdfBuffer - PDF file as buffer
   * @param prompt - Text prompt for evaluation
   * @param config - Optional LLM configuration (temperature, etc.)
   * @returns LLM response
   */
  @Retry(PDF_RETRY_CONFIG)
  async callGeminiFlashLiteWithPDF(
    pdfBuffer: Buffer,
    prompt: string,
    config?: LLMCallParameters['config'],
  ) {
    this.logger.debug(
      `Calling Gemini Flash Lite with PDF (size: ${pdfBuffer.length} bytes)`,
    );

    const response = await this.gemini.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBuffer.toString('base64'),
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      config,
    });

    this.logger.debug('Gemini Flash Lite with PDF call succeeded');
    return response;
  }

  /**
   * Calls Gemini Flash model with text input
   * Used for final synthesis (combining CV and Project evaluation results)
   *
   * Retry configuration: TEXT_RETRY_CONFIG
   * - Max retries: 3
   * - Initial delay: 500ms
   * - Timeout: 60s
   *
   * @param params - LLM call parameters (contents, config, etc.)
   * @returns LLM response
   */
  @Retry(TEXT_RETRY_CONFIG)
  async callGeminiFlash(params: LLMCallParameters) {
    this.logger.debug('Calling Gemini Flash (text-only)');

    const response = await this.gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      ...params,
    });

    this.logger.debug('Gemini Flash call succeeded');
    return response;
  }
}
