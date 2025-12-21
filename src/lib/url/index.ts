/**
 * URL Module - Central URL processing pipeline
 */

export {
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
  type ContentType,
  type UrlAssessment,
  type UrlPipelineResult,
  type UrlPipelineOptions,
} from './pipeline';
