'use strict';
const WIDTHS = { apple: 376, pill: 540, fluent: 404 };
function resizeRequest(style, request) {
  if (style === 'mini' || style === 'percent') {
    if (!request || !Number.isFinite(request.width) || !Number.isFinite(request.height)) return null;
    return { width: Math.max(style === 'percent' ? 72 : 100, Math.min(324, Math.ceil(request.width))), height: Math.max(60, Math.min(1000, Math.ceil(request.height))) };
  }
  if (!Number.isFinite(request) || !WIDTHS[style]) return null;
  return { width: WIDTHS[style], height: Math.max(100, Math.min(1000, Math.ceil(request))) };
}
module.exports = { resizeRequest };
