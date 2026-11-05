import type { FibonacciItem, HandlesItem, LineStyle, ResolvedStyle, SceneItem, Shape } from 'keystone-financial-tools-core';
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
