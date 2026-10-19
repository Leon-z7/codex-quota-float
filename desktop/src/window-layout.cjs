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
// Keep the capsule's screen coordinates fixed while its transparent host grows.
// At screen edges only the dropdown changes direction/size; its content scrolls.
function percentBounds(bounds, area, request, previous = null) {
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  const barWidth = clamp(Math.ceil(request.barWidth), 72, Math.min(324, area.width));
  const anchorX = clamp(bounds.x + (previous?.barLeft ?? 12) - 12, area.x, area.x + area.width - barWidth);
  const anchorY = clamp(bounds.y + (previous?.barTop ?? 12) - 12, area.y, area.y + area.height - 60);
  const width = Math.min(request.expanded ? 324 : barWidth, area.width);
  const below = Math.max(0, area.y + area.height - anchorY - 68);
  const above = Math.max(0, anchorY - area.y - 8);
  const wanted = Math.max(0, request.height - 68);
  const placement = wanted > below && above > below ? 'above' : 'below';
  const panelHeight = request.expanded ? Math.min(wanted, placement === 'above' ? above : below) : 0;
  const height = request.expanded ? panelHeight + 68 : 60;
  const x = clamp(anchorX + barWidth - width, area.x, area.x + area.width - width);
  const y = request.expanded && placement === 'above' ? anchorY - panelHeight - 8 : anchorY;
  return { bounds: {x, y, width, height}, barLeft: anchorX - x + 12, barTop: anchorY - y + 12,
    panelTop: placement === 'above' ? 12 : 56, panelMaxHeight: panelHeight, placement };
}
module.exports = { resizeRequest, percentBounds };
