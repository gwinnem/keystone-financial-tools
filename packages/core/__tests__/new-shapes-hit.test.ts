import { describe, expect, it } from 'vitest';
import { distanceToPath, distanceToPolygon, distanceToShape, insidePolygon } from '../src/hit/distance';
import { arrowheadPoints, ellipsePoints, FLATNESS_PX, flattenCurve } from '../src/hit/flatten';
import { GeometryCache } from '../src/hit/geometry-cache';
import { hitTest } from '../src/hit/hit-test';
import { registerKind } from '../src/kinds';
import { createMockHost } from '../src/testing/mock-host';
import type { Anchor, Drawing, DrawingKind } from '../src/types';
import type { ArrowheadShape, CurveShape, EllipseShape, GlyphShape, PolygonShape, PolylineShape } from '../src/geometry/types';
import { seeded } from './random';

// E12-F02-S02 (FR-TOOL-037): hit-testing of the new shapes.
const P = (x: number, y: number) => ({ x, y });
const never = () => false;
const always = () => true;
const SQUARE = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)];
const EPS = 1e-9;

const polyline = (points: PolylineShape['points']): PolylineShape => ({ type: 'polyline', part: 'body', points });
const polygon = (points: PolygonShape['points']): PolygonShape => ({ type: 'polygon', part: 'body', points });
const ellipse = (cx: number, cy: number, radiusX: number, radiusY: number, rotation = 0): EllipseShape => ({ type: 'ellipse', part: 'body', center: P(cx, cy), radiusX, radiusY, rotation });
const quad: CurveShape = { type: 'curve', part: 'body', from: P(0, 0), controls: [P(50, 40)], to: P(100, 0) };
const cubic: CurveShape = { type: 'curve', part: 'body', from: P(0, 0), controls: [P(30, 80), P(70, -80)], to: P(100, 0) };
const arrow = (tip = P(10, 0), angle = 0, length = 10, width = 8): ArrowheadShape => ({ type: 'arrowhead', part: 'body', tip, angle, length, width });
const glyph: GlyphShape = { type: 'glyph', part: 'body', x: 100, y: 50, width: 20, height: 10, glyph: 'x', source: 'text', fontSize: 10 };

describe('distanceToPath', () => {
  const path = [P(0, 0), P(10, 0), P(10, 10)];

  it('is the distance to the nearest segment of an open path', () => {
    expect(distanceToPath(P(5, 3), path, false)).toBe(3);
    expect(distanceToPath(P(13, 5), path, false)).toBe(3);
    expect(distanceToPath(P(-3, 0), path, false)).toBe(3);
  });

  it('closes the path when asked: the last point joins the first', () => {
    expect(distanceToPath(P(0, 10), path, false)).toBe(10);
    expect(distanceToPath(P(0, 10), path, true)).toBeCloseTo(Math.SQRT1_2 * 10, 12);
    expect(distanceToPath(P(4, 6), path, true)).toBeCloseTo(Math.SQRT2, 12);
    expect(distanceToPath(P(4, 6), path, false)).toBe(6);
  });

  it('is the distance to the point for a path of one point, and infinite for none', () => {
    expect(distanceToPath(P(3, 4), [P(0, 0)], false)).toBe(5);
    expect(distanceToPath(P(3, 4), [P(0, 0)], true)).toBe(5);
    expect(distanceToPath(P(3, 4), [], false)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('insidePolygon and distanceToPolygon', () => {
  it('tells inside from outside by the even-odd rule', () => {
    expect(insidePolygon(P(5, 5), SQUARE)).toBe(true);
    expect(insidePolygon(P(15, 5), SQUARE)).toBe(false);
    expect(insidePolygon(P(-1, 5), SQUARE)).toBe(false);
    expect(insidePolygon(P(5, 15), SQUARE)).toBe(false);
    expect(insidePolygon(P(5, -5), SQUARE)).toBe(false);
  });

  it('treats a point in the hole of a self-crossing outline as outside (even-odd)', () => {
    const bowtie = [P(0, 0), P(10, 10), P(10, 0), P(0, 10)];
    expect(insidePolygon(P(2, 5), bowtie)).toBe(true);
    expect(insidePolygon(P(5, 1), bowtie)).toBe(false);
  });

  it('is 0 inside a filled polygon and the distance to the edge for an unfilled one', () => {
    expect(distanceToPolygon(P(5, 4), SQUARE, true)).toBe(0);
    expect(distanceToPolygon(P(5, 4), SQUARE, false)).toBe(4);
  });

  it('is the distance to the outline outside, filled or not', () => {
    expect(distanceToPolygon(P(14, 5), SQUARE, true)).toBe(4);
    expect(distanceToPolygon(P(14, 5), SQUARE, false)).toBe(4);
    expect(distanceToPolygon(P(13, 14), SQUARE, true)).toBe(5);
  });
});

describe('distanceToShape for the new shapes (FR-TOOL-037)', () => {
  it('hits a polyline by its segments, never by its inside, and ignores the closing edge', () => {
    const line = polyline([P(0, 0), P(10, 0), P(10, 10)]);
    expect(distanceToShape(P(5, 3), line, always)).toBe(3);
    expect(distanceToShape(P(4, 6), line, always)).toBe(6);
  });

  it('hits a polygon by its outline, and by its inside only when filled', () => {
    expect(distanceToShape(P(5, 4), polygon(SQUARE), never)).toBe(4);
    expect(distanceToShape(P(5, 4), polygon(SQUARE), always)).toBe(0);
    expect(distanceToShape(P(5, 14), polygon(SQUARE), always)).toBe(4);
  });

  it('hits an ellipse by its outline, and by its inside only when filled', () => {
    const circle = ellipse(100, 100, 50, 50);
    expect(distanceToShape(P(150, 100), circle, never)).toBeLessThanOrEqual(FLATNESS_PX);
    expect(distanceToShape(P(100, 100), circle, never)).toBeCloseTo(50, 0);
    expect(distanceToShape(P(100, 100), circle, always)).toBe(0);
    expect(Math.abs(distanceToShape(P(210, 100), circle, never) - 60)).toBeLessThanOrEqual(FLATNESS_PX + EPS);
  });

  it('follows the radii and the rotation of an ellipse', () => {
    const flat = ellipse(0, 0, 100, 20);
    expect(distanceToShape(P(100, 0), flat, never)).toBeLessThanOrEqual(FLATNESS_PX);
    expect(distanceToShape(P(0, 20), flat, never)).toBeLessThanOrEqual(FLATNESS_PX);
    expect(distanceToShape(P(0, 100), flat, never)).toBeGreaterThan(70);
    const turned = ellipse(0, 0, 100, 20, Math.PI / 2);
    expect(distanceToShape(P(0, 100), turned, never)).toBeLessThanOrEqual(FLATNESS_PX);
    expect(distanceToShape(P(20, 0), turned, never)).toBeLessThanOrEqual(FLATNESS_PX);
    expect(distanceToShape(P(100, 0), turned, never)).toBeGreaterThan(70);
  });

  it('hits a curve by its flattened path within 0.25 px, and not by its inside', () => {
    expect(distanceToShape(P(50, 20), quad, always)).toBeLessThanOrEqual(FLATNESS_PX + EPS);
    expect(distanceToShape(P(50, 10), quad, always)).toBeCloseTo(10, 0);
    expect(distanceToShape(P(50, 30), quad, always)).toBeCloseTo(10, 0);
    expect(distanceToShape(P(50, 0), cubic, always)).toBeLessThanOrEqual(FLATNESS_PX + EPS);
  });

  it('hits an arrowhead anywhere in its triangle, and by distance outside', () => {
    expect(distanceToShape(P(7, 0), arrow(), never)).toBe(0);
    expect(distanceToShape(P(13, 0), arrow(), never)).toBe(3);
    expect(distanceToShape(P(0, 10), arrow(), never)).toBe(6);
  });

  it('hits a glyph anywhere in its box, and by distance outside', () => {
    expect(distanceToShape(P(110, 55), glyph, never)).toBe(0);
    expect(distanceToShape(P(100, 50), glyph, never)).toBe(0);
    expect(distanceToShape(P(95, 55), glyph, never)).toBe(5);
    expect(distanceToShape(P(110, 70), glyph, never)).toBe(10);
  });
});

describe('flattenCurve', () => {
  it('has the end points first and last', () => {
    for (const curve of [quad, cubic]) {
      const points = flattenCurve(curve);
      expect(points[0]).toEqual(curve.from);
      expect(points[points.length - 1]).toEqual(curve.to);
    }
  });

  it('cuts a quadratic into sqrt(d / (4 * 0.25)) segments', () => {
    expect(flattenCurve(quad)).toHaveLength(10);
    expect(flattenCurve({ ...quad, controls: [P(50, 0)] })).toHaveLength(2);
    expect(flattenCurve({ ...quad, controls: [P(50, 0.5)] })).toHaveLength(2);
    expect(flattenCurve({ ...quad, controls: [P(50, 0.6)] })).toHaveLength(3);
  });

  it('cuts a cubic into sqrt(3 * m / (4 * 0.25)) segments, m the larger second difference', () => {
    // Second differences: (0,0)-2(30,80)+(70,-80) = (10,-240) and (30,80)-2(70,-80)+(100,0) = (-10,240): both 240.2, so sqrt(3 * 240.2) = 26.8 -> 27 segments.
    expect(flattenCurve(cubic)).toHaveLength(28);
    const lopsided: CurveShape = { type: 'curve', part: 'body', from: P(0, 0), controls: [P(0, 0), P(10, 0)], to: P(10, 0) };
    // Second differences (10,0)-> 10 and (0,0)-2(10,0)+(10,0) -> 10, so 30 segments^2 = ceil(sqrt(30)) = 6.
    expect(flattenCurve(lopsided)).toHaveLength(7);
    const late: CurveShape = { type: 'curve', part: 'body', from: P(0, 0), controls: [P(40, 0), P(40, 0)], to: P(40, 0) };
    // Only the second difference of the first three points is 40 here: also 12 points.
    expect(flattenCurve(late)).toHaveLength(12);
    const early: CurveShape = { type: 'curve', part: 'body', from: P(0, 0), controls: [P(0, 0), P(0, 0)], to: P(40, 0) };
    // Only the second difference of the last three points is 40: sqrt(3 * 40) = 10.95 -> 11 segments.
    expect(flattenCurve(early)).toHaveLength(12);
  });

  it('lies on the curve', () => {
    const points = flattenCurve(cubic);
    const index = Math.floor(points.length / 2);
    const t = index / (points.length - 1);
    const u = 1 - t;
    expect(points[index]?.x).toBeCloseTo(3 * u * u * t * 30 + 3 * u * t * t * 70 + t * t * t * 100, 9);
    expect(points[index]?.y).toBeCloseTo(3 * u * u * t * 80 + 3 * u * t * t * -80, 9);
    const quadPoints = flattenCurve(quad);
    const q = Math.floor(quadPoints.length / 2) / (quadPoints.length - 1);
    expect(quadPoints[Math.floor(quadPoints.length / 2)]?.y).toBeCloseTo(2 * (1 - q) * q * 40, 9);
  });
});

describe('ellipsePoints', () => {
  it('has as many points as the larger radius needs', () => {
    expect(ellipsePoints(ellipse(0, 0, 20, 20))).toHaveLength(20);
    expect(ellipsePoints(ellipse(0, 0, 20, 5))).toHaveLength(20);
    expect(ellipsePoints(ellipse(0, 0, 5, 20))).toHaveLength(20);
  });

  it('has at least 8 points and at most 1024', () => {
    expect(ellipsePoints(ellipse(0, 0, 0.01, 0.01))).toHaveLength(8);
    expect(ellipsePoints(ellipse(0, 0, 0.5, 0.5))).toHaveLength(8);
    expect(ellipsePoints(ellipse(0, 0, 1e9, 1))).toHaveLength(1024);
    expect(ellipsePoints(ellipse(0, 0, 0, 0))).toHaveLength(8);
  });

  it('starts on the rotated x axis and lies on the outline', () => {
    const points = ellipsePoints(ellipse(10, 20, 30, 10, Math.PI / 2));
    expect(points[0]?.x).toBeCloseTo(10, 9);
    expect(points[0]?.y).toBeCloseTo(50, 9);
    for (const point of points) {
      const x = point.y - 20;
      const y = -(point.x - 10);
      expect((x / 30) ** 2 + (y / 10) ** 2).toBeCloseTo(1, 9);
    }
  });

  it('keeps a corner no more than 0.25 px from the circle between its neighbours', () => {
    const points = ellipsePoints(ellipse(0, 0, 100, 100));
    const a = points[0] as { x: number; y: number };
    const b = points[1] as { x: number; y: number };
    const sag = 100 - Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2);
    expect(sag).toBeLessThanOrEqual(FLATNESS_PX);
    expect(sag).toBeGreaterThan(FLATNESS_PX / 2);
  });
});

describe('arrowheadPoints', () => {
  it('has the tip first, then the two ends of the base behind it', () => {
    const [tip, left, right] = arrowheadPoints(arrow(P(10, 0), 0, 10, 8));
    expect(tip).toEqual(P(10, 0));
    expect(left?.x).toBeCloseTo(0, 12);
    expect(left?.y).toBeCloseTo(4, 12);
    expect(right?.x).toBeCloseTo(0, 12);
    expect(right?.y).toBeCloseTo(-4, 12);
  });

  it('turns with the angle', () => {
    const [tip, left, right] = arrowheadPoints(arrow(P(0, 10), Math.PI / 2, 10, 8));
    expect(tip).toEqual(P(0, 10));
    expect(left?.x).toBeCloseTo(-4, 12);
    expect(left?.y).toBeCloseTo(0, 12);
    expect(right?.x).toBeCloseTo(4, 12);
    expect(right?.y).toBeCloseTo(0, 12);
  });
});

describe('hit-testing agrees with the geometry for random shapes (property tests)', () => {
  const random = seeded(2024);
  const between = (low: number, high: number) => low + random() * (high - low);

  it('is within 0.25 px of an ellipse at any point of its outline, and 0 inside when filled', () => {
    for (let run = 0; run < 100; run++) {
      const shape = ellipse(between(-200, 200), between(-200, 200), between(20, 300), between(20, 300), between(0, Math.PI));
      const angle = between(0, 2 * Math.PI);
      const x = shape.radiusX * Math.cos(angle);
      const y = shape.radiusY * Math.sin(angle);
      const cos = Math.cos(shape.rotation);
      const sin = Math.sin(shape.rotation);
      const onOutline = P(shape.center.x + x * cos - y * sin, shape.center.y + x * sin + y * cos);
      expect(distanceToShape(onOutline, shape, never)).toBeLessThanOrEqual(FLATNESS_PX + 1e-3);
      const inside = P(shape.center.x + (onOutline.x - shape.center.x) * 0.9, shape.center.y + (onOutline.y - shape.center.y) * 0.9);
      expect(distanceToShape(inside, shape, always)).toBe(0);
      expect(distanceToShape(inside, shape, never)).toBeGreaterThan(0);
    }
  });

  it('is d from a circle for a point d outside it (within 0.25 px)', () => {
    for (let run = 0; run < 100; run++) {
      const radius = between(10, 300);
      const gap = between(0.5, 40);
      const angle = between(0, 2 * Math.PI);
      const shape = ellipse(between(-100, 100), between(-100, 100), radius, radius);
      const point = P(shape.center.x + (radius + gap) * Math.cos(angle), shape.center.y + (radius + gap) * Math.sin(angle));
      expect(Math.abs(distanceToShape(point, shape, never) - gap)).toBeLessThanOrEqual(FLATNESS_PX + EPS);
      expect(Math.abs(distanceToShape(point, shape, always) - gap)).toBeLessThanOrEqual(FLATNESS_PX + EPS);
    }
  });

  it('is within 0.25 px of a quadratic or cubic curve at any of its points', () => {
    for (let run = 0; run < 200; run++) {
      const point = () => P(between(0, 400), between(0, 400));
      const [from, a, b, to] = [point(), point(), point(), point()] as [ReturnType<typeof point>, ReturnType<typeof point>, ReturnType<typeof point>, ReturnType<typeof point>];
      const t = random();
      const u = 1 - t;
      if (run % 2 === 0) {
        const curve: CurveShape = { type: 'curve', part: 'body', from, controls: [a], to };
        const on = P(u * u * from.x + 2 * u * t * a.x + t * t * to.x, u * u * from.y + 2 * u * t * a.y + t * t * to.y);
        expect(distanceToShape(on, curve, never)).toBeLessThanOrEqual(FLATNESS_PX + EPS);
      } else {
        const curve: CurveShape = { type: 'curve', part: 'body', from, controls: [a, b], to };
        const on = P(u ** 3 * from.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * to.x, u ** 3 * from.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * to.y);
        expect(distanceToShape(on, curve, never)).toBeLessThanOrEqual(FLATNESS_PX + EPS);
      }
    }
  });

  it('is 0 on a polyline, and d from a single segment for a point d beside it', () => {
    for (let run = 0; run < 100; run++) {
      const from = P(between(-200, 200), between(-200, 200));
      const to = P(between(-200, 200), between(-200, 200));
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const t = random();
      const on = P(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      const gap = between(0.5, 30);
      const beside = P(on.x - ((to.y - from.y) / length) * gap, on.y + ((to.x - from.x) / length) * gap);
      expect(distanceToShape(on, polyline([from, to]), never)).toBeCloseTo(0, 9);
      expect(distanceToShape(beside, polyline([from, to]), never)).toBeCloseTo(gap, 9);
    }
  });

  it('is d from a regular polygon for a point d outside the middle of an edge, and 0 inside when filled', () => {
    for (let run = 0; run < 100; run++) {
      const corners = 3 + Math.floor(random() * 6);
      const radius = between(20, 200);
      const start = between(0, Math.PI);
      const points = Array.from({ length: corners }, (_, i) => P(radius * Math.cos(start + (2 * Math.PI * i) / corners), radius * Math.sin(start + (2 * Math.PI * i) / corners)));
      const edge = Math.floor(random() * corners);
      const a = points[edge] as { x: number; y: number };
      const b = points[(edge + 1) % corners] as { x: number; y: number };
      const middle = P((a.x + b.x) / 2, (a.y + b.y) / 2);
      const gap = between(0.5, 30);
      const norm = Math.hypot(middle.x, middle.y);
      const outside = P(middle.x + (middle.x / norm) * gap, middle.y + (middle.y / norm) * gap);
      expect(distanceToShape(outside, polygon(points), always)).toBeCloseTo(gap, 9);
      expect(distanceToShape(outside, polygon(points), never)).toBeCloseTo(gap, 9);
      expect(distanceToShape(P(0, 0), polygon(points), always)).toBe(0);
      expect(distanceToShape(P(0, 0), polygon(points), never)).toBeGreaterThan(0);
    }
  });

  it('is 0 inside an arrowhead and d ahead of its tip', () => {
    for (let run = 0; run < 100; run++) {
      const tip = P(between(-100, 100), between(-100, 100));
      const angle = between(0, 2 * Math.PI);
      const length = between(10, 40);
      const shape = arrow(tip, angle, length, between(4, 20));
      const corners = arrowheadPoints(shape);
      const centroid = P(((corners[0]?.x ?? 0) + (corners[1]?.x ?? 0) + (corners[2]?.x ?? 0)) / 3, ((corners[0]?.y ?? 0) + (corners[1]?.y ?? 0) + (corners[2]?.y ?? 0)) / 3);
      expect(distanceToShape(centroid, shape, never)).toBe(0);
      const gap = between(0.5, 30);
      const ahead = P(tip.x + Math.cos(angle) * gap, tip.y + Math.sin(angle) * gap);
      expect(distanceToShape(ahead, shape, never)).toBeCloseTo(gap, 9);
    }
  });

  it('is 0 in a glyph box and the distance to the box outside it', () => {
    for (let run = 0; run < 100; run++) {
      const box: GlyphShape = { ...glyph, x: between(-100, 100), y: between(-100, 100), width: between(5, 60), height: between(5, 60) };
      expect(distanceToShape(P(box.x + random() * box.width, box.y + random() * box.height), box, never)).toBe(0);
      const gap = between(0.5, 30);
      expect(distanceToShape(P(box.x + box.width + gap, box.y + box.height / 2), box, never)).toBeCloseTo(gap, 9);
    }
  });
});

describe('hitTest with the new shapes (FR-HIT-002, FR-HIT-004 unchanged)', () => {
  const KIND = 'hit-shapes' as DrawingKind;
  const host = createMockHost();
  // The default mock host: x = time / 6000 and y = 400 - 2 * price.
  const A = (x: number, y: number): Anchor => ({ time: x * 6000, price: (400 - y) / 2, yAxisId: 'price' });
  registerKind({
    id: KIND,
    anchors: { min: 2, max: 2 },
    defaults: {},
    group: 'shapes',
    geometry: ({ points }) => {
      const [p1, p2] = points as [{ x: number; y: number }, { x: number; y: number }];
      return [
        { type: 'polygon', part: 'body', points: [p1, { x: p2.x, y: p1.y }, p2, { x: p1.x, y: p2.y }] },
        { type: 'ellipse', part: 'level:0.5', center: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, radiusX: 20, radiusY: 20, rotation: 0 },
      ];
    },
  });
  const make = (extra: Partial<Drawing> = {}): Drawing => ({ id: 'h', kind: KIND, anchors: [A(100, 100), A(300, 300)], ...extra });
  const probe = (drawing: Drawing, x: number, y: number, pointerType?: 'mouse' | 'pen' | 'touch') => hitTest({ x, y }, { drawings: [drawing], cache: new GeometryCache(host), pointerType });

  it('hits an outline within 6 px for a mouse and 12 px for touch, with the part of the shape', () => {
    expect(probe(make(), 94, 150)).toEqual({ id: 'h', part: 'body', locked: false });
    expect(probe(make(), 93, 150)).toBeNull();
    expect(probe(make(), 88, 150, 'touch')).toEqual({ id: 'h', part: 'body', locked: false });
    expect(probe(make(), 87, 150, 'touch')).toBeNull();
  });

  it('hits the inside of a filled shape only, and names the part of the nearest shape', () => {
    expect(probe(make({ style: { fillOpacity: 0 } }), 150, 120)).toBeNull();
    expect(probe(make({ style: { fillOpacity: 0.2 } }), 150, 120)).toEqual({ id: 'h', part: 'body', locked: false });
    expect(probe(make(), 220, 200)).toEqual({ id: 'h', part: 'level:0.5', locked: false });
  });

  it('reports a locked drawing as locked', () => {
    expect(probe(make({ locked: true }), 94, 150)).toEqual({ id: 'h', part: 'body', locked: true });
  });
});
