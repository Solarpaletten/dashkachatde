const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const { validateTranslation } = require('../middleware/validation');
const { translationLimiter } = require('../middleware/rateLimit');
const { UnifiedTranslationService } = require('../services/unifiedTranslationService');

const translationService = new UnifiedTranslationService();

router.post('/translate', 
  translationLimiter,
  validateTranslation,
  async (req, res, next) => {
    try {
      const startTime = Date.now();
      
      const { 
        text, 
        source_language = 'RU', 
        target_language = 'DE',
        fromLang,
        toLang,
        from,
        to
      } = req.body;

      const sourceCode = (source_language || fromLang || from || 'RU').toUpperCase();
      const targetCode = (target_language || toLang || to || 'DE').toUpperCase();

      // Check cache
      const cached = cache.get(text, sourceCode, targetCode);
      if (cached) {
        return res.json({
          ...cached,
          from_cache: true,
          processing_time: Date.now() - startTime
        });
      }

      // Translate
      const result = await translationService.translateText(
        text.trim(), 
        sourceCode, 
        targetCode
      );

      const response = {
        status: 'success',
        original_text: result.originalText,
        translated_text: result.translatedText,
        source_language: sourceCode.toLowerCase(),
        target_language: targetCode.toLowerCase(),
        confidence: result.confidence,
        timestamp: new Date().toISOString(),
        processing_time: result.processingTime,
        provider: result.provider,
        from_cache: false
      };

      // Save to cache
      cache.set(text, sourceCode, targetCode, response);

      res.json(response);

    } catch (error) {
      next(error);
    }
});

module.exports = router;