import type { ArrowheadShape, FibonacciItem, GlyphShape, HandlesItem, LineStyle, Point, ResolvedStyle, SceneItem, Shape } from 'keystone-financial-tools-core';
import type { Bar } from './data';
import type { PlotHost } from './plot-host';

const UP_COLOR = '#089981';
const DOWN_COLOR = '#f23645';
const SEPARATOR_COLOR = '#d0d3da';
const DASHES: Readonly<Record<LineStyle, readonly number[]>> = { solid: [], dashed: [6, 4], dotted: [2, 3] };

/** Sizes a canvas to `width` x `height` CSS px at the screen's pixel density and returns its context, scaled to CSS px. */
export function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

/** Draws the candles in the price pane and the volume bars below them; bars outside the plot are skipped. */
export function renderBase(context: CanvasRenderingContext2D, host: PlotHost, bars: readonly Bar[]): void {
  context.clearRect(0, 0, host.width, host.height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, host.width, host.height);
  context.setLineDash([]);
  context.globalAlpha = 1;
  const bodyWidth = Math.max(1, host.pxPerBar * 0.6);
  const shown = bars.filter((bar) => {
    const x = host.timeToX(bar.time);
    return x + bodyWidth >= 0 && x - bodyWidth <= host.width;
  });
  context.save();
  context.beginPath();
  context.rect(0, 0, host.width, host.priceHeight);
  context.clip();
  drawCandles(context, host, shown, bodyWidth);
  context.restore();
  drawVolume(context, host, shown, bodyWidth);
  context.strokeStyle = SEPARATOR_COLOR;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, host.priceHeight + 0.5);
  context.lineTo(host.width, host.priceHeight + 0.5);
  context.stroke();
}

function drawVolume(context: CanvasRenderingContext2D, host: PlotHost, bars: readonly Bar[], bodyWidth: number): void {
  const baseline = host.priceToY(0, 'volume');
  context.globalAlpha = 0.5;
  for (const bar of bars) {
    context.fillStyle = bar.close >= bar.open ? UP_COLOR : DOWN_COLOR;
    const top = host.priceToY(bar.volume, 'volume');
    context.fillRect(host.timeToX(bar.time) - bodyWidth / 2, top, bodyWidth, baseline - top);
  }
  context.globalAlpha = 1;
}

function drawCandles(context: CanvasRenderingContext2D, host: PlotHost, bars: readonly Bar[], bodyWidth: number): void {
  for (const bar of bars) {
    const x = host.timeToX(bar.time);
    const color = bar.close >= bar.open ? UP_COLOR : DOWN_COLOR;
    const top = host.priceToY(Math.max(bar.open, bar.close), 'price');
    const bottom = host.priceToY(Math.min(bar.open, bar.close), 'price');
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, host.priceToY(bar.high, 'price'));
    context.lineTo(x, host.priceToY(bar.low, 'price'));
    context.stroke();
    context.fillRect(x - bodyWidth / 2, top, bodyWidth, Math.max(1, bottom - top));
  }
}

/** Draws what the tools ask for: `tools.getScene()`. */
export function renderOverlay(context: CanvasRenderingContext2D, host: PlotHost, items: readonly SceneItem[]): void {
  context.clearRect(0, 0, host.width, host.height);
  for (const item of items) {
    context.save();
    switch (item.type) {
      case 'shape':
        for (const shape of item.shapes) drawShape(context, shape, item.style, item.opacity);
        break;
      case 'preview':
        for (const shape of item.shapes) drawShape(context, shape, item.style, 0.7);
        break;
      case 'fibonacci':
        drawFibonacci(context, host, item);
        break;
      case 'handles':
        drawHandles(context, item);
        break;
    }
    context.restore();
  }
}

function stroke(context: CanvasRenderingContext2D, style: ResolvedStyle, alpha: number): void {
  context.strokeStyle = style.color;
  context.lineWidth = style.lineWidth;
  context.setLineDash([...DASHES[style.lineStyle]]);
  context.globalAlpha = alpha;
}

function drawShape(context: CanvasRenderingContext2D, shape: Shape, style: ResolvedStyle, alpha: number): void {
  switch (shape.type) {
    case 'line':
      stroke(context, style, alpha);
      context.beginPath();
      context.moveTo(shape.from.x, shape.from.y);
      context.lineTo(shape.to.x, shape.to.y);
      context.stroke();
      return;
    case 'rect':
      if (style.fillOpacity > 0) {
        context.globalAlpha = alpha * style.fillOpacity;
        context.fillStyle = style.fillColor;
        context.fillRect(shape.x, shape.y, shape.width, shape.height);
      }
      stroke(context, style, alpha);
      context.strokeRect(shape.x, shape.y, shape.width, shape.height);
      return;
    case 'arc':
      stroke(context, style, alpha);
      context.beginPath();
      context.arc(shape.center.x, shape.center.y, shape.radius, shape.startAngle, shape.endAngle);
      context.stroke();
      return;
    case 'text':
      context.globalAlpha = alpha;
      context.fillStyle = style.textColor;
      context.font = `${shape.fontSize}px sans-serif`;
      context.textBaseline = 'top';
      shape.lines.forEach((line, index) => context.fillText(line, shape.x, shape.y + index * shape.lineHeight));
      return;
    case 'label':
      context.globalAlpha = alpha;
      context.fillStyle = style.color;
      context.font = '11px sans-serif';
      context.textBaseline = 'bottom';
      context.fillText(shape.text, shape.x, shape.y);
      return;
    case 'polyline':
      stroke(context, style, alpha);
      context.beginPath();
      tracePath(context, shape.points);
      context.stroke();
      return;
    case 'polygon':
      context.beginPath();
      tracePath(context, shape.points);
      context.closePath();
      fillAndStroke(context, style, alpha);
      return;
    case 'ellipse':
      context.beginPath();
      context.ellipse(shape.center.x, shape.center.y, shape.radiusX, shape.radiusY, shape.rotation, 0, 2 * Math.PI);
      fillAndStroke(context, style, alpha);
      return;
    case 'curve':
      stroke(context, style, alpha);
      context.beginPath();
      context.moveTo(shape.from.x, shape.from.y);
      if (shape.controls.length === 1) context.quadraticCurveTo(shape.controls[0].x, shape.controls[0].y, shape.to.x, shape.to.y);
      else context.bezierCurveTo(shape.controls[0].x, shape.controls[0].y, shape.controls[1].x, shape.controls[1].y, shape.to.x, shape.to.y);
      context.stroke();
      return;
    case 'arrowhead':
      drawArrowhead(context, shape, style, alpha);
      return;
    case 'glyph':
      drawGlyph(context, shape, style, alpha);
      return;
  }
}

function tracePath(context: CanvasRenderingContext2D, points: readonly Point[]): void {
  points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
}

/** Fills the current path with the fill of the style, when it has one, and strokes it. */
function fillAndStroke(context: CanvasRenderingContext2D, style: ResolvedStyle, alpha: number): void {
  if (style.fillOpacity > 0) {
    context.globalAlpha = alpha * style.fillOpacity;
    context.fillStyle = style.fillColor;
    context.fill();
  }
  stroke(context, style, alpha);
  context.stroke();
}

/** A solid triangle in the stroke colour: the tip, and the two corners of the base behind it. */
function drawTriangle(context: CanvasRenderingContext2D, tip: Point, angle: number, length: number, width: number, color: string, alpha: number): void {
  const back = { x: tip.x - Math.cos(angle) * length, y: tip.y - Math.sin(angle) * length };
  const side = { x: (-Math.sin(angle) * width) / 2, y: (Math.cos(angle) * width) / 2 };
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(back.x + side.x, back.y + side.y);
  context.lineTo(back.x - side.x, back.y - side.y);
  context.closePath();
  context.fill();
}

function drawArrowhead(context: CanvasRenderingContext2D, shape: ArrowheadShape, style: ResolvedStyle, alpha: number): void {
  drawTriangle(context, shape.tip, shape.angle, shape.length, shape.width, style.color, alpha);
}

const ICON_ANGLES: Readonly<Record<string, number>> = { 'arrow-right': 0, 'arrow-down': Math.PI / 2, 'arrow-left': Math.PI, 'arrow-up': -Math.PI / 2 };

/** Text and emoji as they are, the arrows as a triangle whose tip is in the middle of the edge it points at, and the pin as a dot over a point. */
function drawGlyph(context: CanvasRenderingContext2D, shape: GlyphShape, style: ResolvedStyle, alpha: number): void {
  if (shape.source !== 'icon') {
    context.globalAlpha = alpha;
    context.fillStyle = shape.source === 'text' ? style.textColor : style.color;
    context.font = `${shape.fontSize}px sans-serif`;
    context.textBaseline = 'top';
    context.fillText(shape.glyph, shape.x, shape.y);
    return;
  }
  const middle = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  const angle = ICON_ANGLES[shape.glyph];
  if (angle !== undefined) {
    const tip = { x: middle.x + (Math.cos(angle) * shape.width) / 2, y: middle.y + (Math.sin(angle) * shape.height) / 2 };
    drawTriangle(context, tip, angle, Math.min(shape.width, shape.height), Math.min(shape.width, shape.height) * 0.8, style.color, alpha);
  } else if (shape.glyph === 'pin') {
    drawTriangle(context, { x: middle.x, y: shape.y + shape.height }, -Math.PI / 2, shape.height / 2, shape.width * 0.5, style.color, alpha);
    context.beginPath();
    context.arc(middle.x, shape.y + shape.height * 0.3, shape.width * 0.28, 0, 2 * Math.PI);
    context.fill();
  }
}

/**
 * A simple Fibonacci renderer: the line between the anchors, and for a retracement one horizontal
 * line per visible level. The other kinds show only the line between their anchors.
 */
function drawFibonacci(context: CanvasRenderingContext2D, host: PlotHost, item: FibonacciItem): void {
  const [first, second] = item.anchors;
  const a = { x: host.timeToX(first.time), y: host.priceToY(first.price, first.yAxisId) };
  const b = { x: host.timeToX(second.time), y: host.priceToY(second.price, second.yAxisId) };
  stroke(context, { ...item.style, lineStyle: 'dashed' }, item.opacity);
  context.beginPath();
  context.moveTo(a.x, a.y);
  context.lineTo(b.x, b.y);
  context.stroke();
  if (item.kind !== 'fibonacci-retracement') return;
  const { levels, reverse, extendLeft, extendRight, showLabels } = item.options;
  const from = reverse ? first : second;
  const to = reverse ? second : first;
  const left = extendLeft ? 0 : Math.min(a.x, b.x);
  const right = extendRight ? host.width : Math.max(a.x, b.x);
  context.font = '11px sans-serif';
  context.textBaseline = 'bottom';
  for (const level of levels) {
    if (!level.visible) continue;
    const y = host.priceToY(from.price + (to.price - from.price) * level.ratio, first.yAxisId);
    const color = level.color ?? item.style.color;
    stroke(context, { ...item.style, color, lineStyle: 'solid' }, item.opacity);
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    if (showLabels) {
      context.fillStyle = color;
      context.fillText(String(level.ratio), left + 2, y - 1);
    }
  }
}

function drawHandles(context: CanvasRenderingContext2D, item: HandlesItem): void {
  const { size, fillColor, strokeColor, lineWidth } = item.style;
  context.lineWidth = lineWidth;
  context.strokeStyle = strokeColor;
  context.fillStyle = fillColor;
  item.points.forEach((point, index) => {
    const active = item.active === index;
    const side = active ? size + 2 : size;
    // A locked drawing shows outlines only: there is nothing to grab.
    if (!item.locked) context.fillRect(point.x - side / 2, point.y - side / 2, side, side);
    context.strokeRect(point.x - side / 2, point.y - side / 2, side, side);
  });
}
