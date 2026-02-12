import speech from '@google-cloud/speech';
import pkg from '@google-cloud/translate';
const { v2 } = pkg;
const { Translate } = v2;

// Google Cloud language mapping
const googleCloudLanguageMap = {
  'en': 'en-US',
  'te': 'te-IN',
  'hi': 'hi-IN',
  'ta': 'ta-IN',
  'kn': 'kn-IN',
  'ml': 'ml-IN',
  'pa': 'pa-IN',
  'gu': 'gu-IN',
  'mr': 'mr-IN',
  'bn': 'bn-IN',
  'or': 'or-IN',
  'as': 'as-IN',
  'ur': 'ur-IN',
  'ne': 'ne-IN',
  'sa': 'sa-IN',
  'fr': 'fr-FR',
  'es': 'es-ES',
  'de': 'de-DE',
  'it': 'it-IT',
  'pt': 'pt-PT',
  'ru': 'ru-RU',
  'zh': 'zh-CN',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'ar': 'ar-SA'
};

// Translation language mapping (Google Translate uses different codes)
const translationLanguageMap = {
  'en': 'en',
  'te': 'te',
  'hi': 'hi',
  'ta': 'ta',
  'kn': 'kn',
  'ml': 'ml',
  'pa': 'pa',
  'gu': 'gu',
  'mr': 'mr',
  'bn': 'bn',
  'or': 'or',
  'as': 'as',
  'ur': 'ur',
  'ne': 'ne',
  'sa': 'sa',
  'fr': 'fr',
  'es': 'es',
  'de': 'de',
  'it': 'it',
  'pt': 'pt',
  'ru': 'ru',
  'zh': 'zh',
  'ja': 'ja',
  'ko': 'ko',
  'ar': 'ar'
};

// Normalize language code to our internal format
const normalizeLanguageCode = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  
  if (/^[a-z]{2}([-_][a-z]{2})?$/.test(v)) {
    const two = v.slice(0, 2);
    if (/^[a-z]{2}$/.test(two)) return two;
  }
  
  // Handle common variations
  if (v === 'english' || v === 'en') return 'en';
  if (v === 'telugu' || v === 'te') return 'te';
  if (v === 'hindi' || v === 'hi') return 'hi';
  if (v === 'tamil' || v === 'ta') return 'ta';
  if (v === 'kannada' || v === 'kn') return 'kn';
  if (v === 'malayalam' || v === 'ml') return 'ml';
  if (v === 'punjabi' || v === 'pa') return 'pa';
  if (v === 'gujarati' || v === 'gu') return 'gu';
  if (v === 'marathi' || v === 'mr') return 'mr';
  if (v === 'bengali' || v === 'bn') return 'bn';
  if (v === 'odia' || v === 'or') return 'or';
  if (v === 'assamese' || v === 'as') return 'as';
  if (v === 'urdu' || v === 'ur') return 'ur';
  if (v === 'nepali' || v === 'ne') return 'ne';
  if (v === 'sanskrit' || v === 'sa') return 'sa';
  if (v === 'french' || v === 'fr') return 'fr';
  if (v === 'spanish' || v === 'es') return 'es';
  if (v === 'german' || v === 'de') return 'de';
  if (v === 'italian' || v === 'it') return 'it';
  if (v === 'portuguese' || v === 'pt') return 'pt';
  if (v === 'russian' || v === 'ru') return 'ru';
  if (v === 'chinese' || v === 'zh') return 'zh';
  if (v === 'japanese' || v === 'ja') return 'ja';
  if (v === 'korean' || v === 'ko') return 'ko';
  if (v === 'arabic' || v === 'ar') return 'ar';
  
  // Return as-is if it's already a valid 2-letter code
  if (/^[a-z]{2}$/.test(v)) return v;
  
  return null;
};

class GoogleCloudSTT {
  constructor() {
    this.speechClient = new speech.SpeechClient();
  }

  getSpeechConfig(languageCode) {
    const normalizedCode = normalizeLanguageCode(languageCode) || 'en';
    const googleCode = googleCloudLanguageMap[normalizedCode] || 'en-US';
    
    return {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: googleCode,
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      model: 'latest_short',
      maxAlternatives: 1
    };
  }

  async recognizeStreaming(audioStream, languageCode) {
    try {
      const config = this.getSpeechConfig(languageCode);
      
      const request = {
        config: config,
        interimResults: true,
        enableVoiceActivityEvents: true,
        voiceActivityTimeout: {
          speechStartTimeout: 2000,
          speechEndTimeout: 2000
        }
      };

      console.log('[GoogleCloudSTT] Starting streaming recognition with config:', JSON.stringify(config, null, 2));

      const recognizeStream = this.speechClient.streamingRecognize(request)
        .on('error', (error) => {
          console.error('[GoogleCloudSTT] Streaming error:', error);
        })
        .on('data', (data) => {
          console.log('[GoogleCloudSTT] Received data:', JSON.stringify(data, null, 2));
        })
        .on('end', () => {
          console.log('[GoogleCloudSTT] Streaming ended');
        });

      // Pipe audio data to the recognition stream
      audioStream.pipe(recognizeStream);

      return recognizeStream;
    } catch (error) {
      console.error('[GoogleCloudSTT] Error starting streaming recognition:', error);
      throw error;
    }
  }

  async recognizeSingle(audioBuffer, languageCode) {
    try {
      const config = this.getSpeechConfig(languageCode);
      
      const request = {
        config: config,
        audio: {
          content: audioBuffer.toString('base64')
        }
      };

      console.log('[GoogleCloudSTT] Starting single recognition with config:', JSON.stringify(config, null, 2));

      const [response] = await this.speechClient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      console.log('[GoogleCloudSTT] Single recognition result:', transcription);

      return {
        text: transcription,
        confidence: response.results[0]?.alternatives[0]?.confidence || 0,
        language: languageCode
      };
    } catch (error) {
      console.error('[GoogleCloudSTT] Error in single recognition:', error);
      throw error;
    }
  }
}

class GoogleCloudTranslation {
  constructor() {
    console.log('[GoogleCloudTranslation] Initializing translation service...');
    
    // Check for API key first
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
    if (apiKey) {
      console.log('[GoogleCloudTranslation] Using API key authentication');
      this.translateClient = new Translate({
        key: apiKey,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'aero-sonix'
      });
    } else {
      console.log('[GoogleCloudTranslation] Using service account authentication');
      // Try service account authentication
      try {
        this.translateClient = new Translate({
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'aero-sonix'
        });
      } catch (error) {
        console.error('[GoogleCloudTranslation] Failed to initialize with service account:', error);
        throw new Error('Failed to initialize Google Cloud Translation client. Please check credentials.');
      }
    }
  }

  async listSupportedLanguages(target = 'en') {
    try {
      console.log('[GoogleCloudTranslation] Listing supported languages for target:', target);
      
      const normalizedTarget = normalizeLanguageCode(target) || 'en';
      const googleTargetCode = translationLanguageMap[normalizedTarget] || 'en';
      
      console.log('[GoogleCloudTranslation] Using Google target code:', googleTargetCode);
      
      const [languages] = await this.translateClient.getLanguages(googleTargetCode);
      
      if (!Array.isArray(languages)) {
        console.error('[GoogleCloudTranslation] Invalid response from Google Cloud:', languages);
        throw new Error('Invalid response from Google Cloud Translation API');
      }
      
      console.log('[GoogleCloudTranslation] Successfully retrieved', languages.length, 'languages');
      
      // Transform the response to include both name and code
      const transformedLanguages = languages.map(lang => ({
        code: lang.code || lang.language,
        name: lang.name || lang.displayName || lang.code,
        language: lang.code || lang.language
      }));
      
      return transformedLanguages;
    } catch (error) {
      console.error('[GoogleCloudTranslation] Error in listSupportedLanguages:', error);
      
      // Handle specific Google Cloud errors
      if (error.code === 7) {
        throw new Error('Google Cloud API key invalid or missing permissions');
      } else if (error.code === 3) {
        throw new Error('Invalid target language parameter');
      } else if (error.code === 8) {
        throw new Error('Google Cloud quota exceeded. Please check billing.');
      } else {
        throw new Error(`Google Cloud Translation error: ${error.message}`);
      }
    }
  }

  async translateText(text, targetLanguage, sourceLanguage = null) {
    try {
      if (!text || !text.trim()) {
        return { translatedText: '', sourceLanguage: targetLanguage };
      }

      const normalizedTarget = normalizeLanguageCode(targetLanguage) || 'en';
      const googleTargetCode = translationLanguageMap[normalizedTarget] || 'en';
      
      const options = {
        to: googleTargetCode
      };

      if (sourceLanguage) {
        const normalizedSource = normalizeLanguageCode(sourceLanguage);
        if (normalizedSource) {
          const googleSourceCode = translationLanguageMap[normalizedSource];
          if (googleSourceCode) {
            options.from = googleSourceCode;
          }
        }
      }

      console.log('[GoogleCloudTranslation] Translating text:', {
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        targetLanguage: googleTargetCode,
        sourceLanguage: options.from
      });

      const [translation, metadata] = await this.translateClient.translate(text, options);

      console.log('[GoogleCloudTranslation] Translation result:', {
        original: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        translated: translation.substring(0, 100) + (translation.length > 100 ? '...' : ''),
        detectedSourceLanguage: metadata?.data?.translations?.[0]?.detectedSourceLanguage
      });

      return {
        translatedText: translation,
        sourceLanguage: metadata?.data?.translations?.[0]?.detectedSourceLanguage || sourceLanguage,
        targetLanguage: googleTargetCode,
        confidence: metadata?.data?.translations?.[0]?.confidence || null
      };
    } catch (error) {
      console.error('[GoogleCloudTranslation] Error translating text:', error);
      throw error;
    }
  }

  async detectLanguage(text) {
    try {
      if (!text || !text.trim()) {
        return { language: 'en', confidence: 0 };
      }

      const [detection] = await this.translateClient.detect(text);

      console.log('[GoogleCloudTranslation] Language detection result:', detection);

      return {
        language: normalizeLanguageCode(detection?.language) || 'en',
        confidence: detection?.confidence || 0
      };
    } catch (error) {
      console.error('[GoogleCloudTranslation] Error detecting language:', error);
      return { language: 'en', confidence: 0 };
    }
  }
}

export {
  GoogleCloudSTT,
  GoogleCloudTranslation,
  googleCloudLanguageMap,
  translationLanguageMap,
  normalizeLanguageCode
};
