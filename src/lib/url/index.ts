/**
 * URL Module - Central URL processing pipeline
 */

export {
  // URL Sanitization (NEW - Security)
  urlSanitize,
  urlExtract,
  urlValidate,

  // Pipeline functions
  prepareUrl,
  prepareUrlSync,
  needsResolve,
  normalizeUrl,
  cleanTrackingParams,
  extractContentId,
  detectContentType,
  mayRequireCookie,
  generateCacheKey,
  isValidUrl,

  // Types
  type ContentType,
  type UrlAssessment,
  type UrlPipelineResult,
  type UrlPipelineOptions,
} from './pipeline';
