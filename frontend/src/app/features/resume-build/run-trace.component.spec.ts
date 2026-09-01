import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RunTraceComponent } from './run-trace.component';
import { NodeVisit, RunTraceEvent, WorkflowTopology, foldTrace } from './resume-build.service';

/** The shape the backend's getWorkflowTopology() actually returns. */
const TOPOLOGY: WorkflowTopology = {
  nodes: [
    '__start__',
    'draft_resume',
    'coach',
    'publish_review',
    'human_review',
    'revise',
    'finalize',
    '__end__',
  ],
  edges: [
    { source: '__start__', target: 'draft_resume', conditional: false },
    { source: 'draft_resume', target: 'coach', conditional: false },
    { source: 'finalize', target: '__end__', conditional: false },
    { source: 'publish_review', target: 'human_review', conditional: false },
    { source: 'revise', target: 'coach', conditional: false },
    { source: 'coach', target: 'publish_review', conditional: true },
    { source: 'coach', target: 'finalize', conditional: true },
    { source: 'human_review', target: 'revise', conditional: true },
    { source: 'human_review', target: 'finalize', conditional: true },
  ],
};

/** A build that failed the coach once, took feedback, revised, then passed. */
function loopedRun(): RunTraceEvent[] {
  const events: RunTraceEvent[] = [];
  let clock = 1_000;
  const start = (node: string, round: number) =>
    events.push({ type: 'node_start', data: { node: node as never, round, at: clock } });
  const end = (node: string, round: number, took: number, extra = {}) => {
    clock += took;
    events.push({
      type: 'node_end',
      data: { node: node as never, round, at: clock, durationMs: took, ...extra },
    });
  };

  start('draft_resume', 1);
  end('draft_resume', 1, 12_400);
  start('coach', 1);
  end('coach', 1, 8_200, {
    score: 72,
    passes: false,
    threshold: 90,
    maxRounds: 3,
    recommendations: 4,
  });
  start('publish_review', 1);
  end('publish_review', 1, 120);
  start('human_review', 1);
  end('human_review', 1, 45_000, { accepted: 2 });
  start('revise', 1);
  end('revise', 1, 9_100, { accepted: 2 });
  start('coach', 2);
  end('coach', 2, 7_500, {
    score: 94,
    passes: true,
    threshold: 90,
    maxRounds: 3,
    recommendations: 0,
  });
  start('finalize', 2);
  end('finalize', 2, 3_300, { reusedExisting: false });
  return events;
}

describe('foldTrace', () => {
  it('closes the matching open visit when a node runs more than once', () => {
    const visits = foldTrace(loopedRun());

    expect(visits.length).toBe(7);
    expect(visits.every((visit) => visit.endedAt !== null)).toBe(true);
    const coach = visits.filter((visit) => visit.node === 'coach');
    expect(coach.length).toBe(2);
    // Round 1's visit must hold round 1's score, not round 2's.
    expect(coach[0]!.round).toBe(1);
    expect(coach[0]!.detail?.score).toBe(72);
    expect(coach[1]!.round).toBe(2);
    expect(coach[1]!.detail?.score).toBe(94);
  });

  it('leaves a visit open when its node never finished', () => {
    const visits = foldTrace([
      { type: 'node_start', data: { node: 'draft_resume', round: 1, at: 1_000 } },
    ]);
    expect(visits[0]!.endedAt).toBeNull();
  });

  it('ignores an end with no matching open visit', () => {
    const visits = foldTrace([
      { type: 'node_end', data: { node: 'coach', round: 1, at: 1_000 } },
    ]);
    expect(visits).toEqual([]);
  });
});

describe('RunTraceComponent', () => {
  let component: RunTraceComponent;
  let fixture: ComponentFixture<RunTraceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RunTraceComponent] }).compileComponents();
    fixture = TestBed.createComponent(RunTraceComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('topology', TOPOLOGY);
  });

  function drive(visits: NodeVisit[], extra: Record<string, unknown> = {}): void {
    fixture.componentRef.setInput('visits', visits);
    for (const [key, value] of Object.entries(extra)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
  }

  it('lists every stage in the order it ran', () => {
    drive(foldTrace(loopedRun()), { completed: true });

    expect(component.traceRows().map((row) => row.label)).toEqual([
      'Draft',
      'Coach review',
      'Publish review',
      'Your feedback',
      'Revise',
      'Coach review',
      'Finalize + PDF',
    ]);
    expect(component.coachRounds()).toBe(2);
  });

  it('reports the coach score, the verdict and the bar it had to clear', () => {
    drive(foldTrace(loopedRun()), { completed: true });
    const coach = component.traceRows().filter((row) => row.label === 'Coach review');

    expect(coach[0]!.detail).toBe('Scored 72 — under the bar of 90, raised 4 recommendations');
    expect(coach[1]!.detail).toBe('Scored 94 — passes the bar of over 90');
  });

  it('times each stage independently', () => {
    drive(foldTrace(loopedRun()), { completed: true });
    const took = new Map(component.traceRows().map((row) => [row.label, row.duration]));

    expect(took.get('Draft')).toBe('12.4s');
    expect(took.get('Publish review')).toBe('120ms');
    expect(took.get('Your feedback')).toBe('45.0s');
    expect(component.totalElapsed()).toBe('1m 26s');
  });

  it('marks only the edges the run actually took', () => {
    drive(foldTrace(loopedRun()), { completed: true });
    const taken = new Set(
      TOPOLOGY.edges
        .filter((_, index) => component.edgeViews()[index]!.cls.includes('taken'))
        .map((edge) => `${edge.source}->${edge.target}`),
    );

    expect(taken.has('coach->publish_review')).toBe(true);
    expect(taken.has('human_review->revise')).toBe(true);
    expect(taken.has('revise->coach')).toBe(true);
    expect(taken.has('coach->finalize')).toBe(true);
    expect(taken.has('finalize->__end__')).toBe(true);
    // The branch this run never used stays unhighlighted.
    expect(taken.has('human_review->finalize')).toBe(false);
  });

  it('draws every node and both pairs of conditional branches', () => {
    drive([]);
    expect(component.nodeViews().length).toBe(TOPOLOGY.nodes.length);
    expect(component.unlaidNodes()).toEqual([]);
    expect(
      component.edgeViews().filter((edge) => edge.cls.includes('conditional')).length,
    ).toBe(4);
  });

  it('routes every edge clear of every node box', () => {
    // The bug this guards: a direct curve from coach to finalize ran straight
    // through the Publish review box, so the picture implied a path that does
    // not exist. Every path is a polyline, so sampling its segments is exact.
    drive(foldTrace(loopedRun()), { completed: true });
    const boxes = component.nodeViews().map((node) => ({
      left: node.boxX + 1,
      right: node.boxX + node.width - 1,
      top: node.boxY + 1,
      bottom: node.boxY + node.height - 1,
    }));

    const collisions: string[] = [];
    for (const edge of component.edgeViews()) {
      expect(edge.d).not.toContain('C'); // polylines only, or the sampling lies
      const points = pointsOf(edge.d);
      for (let i = 0; i < points.length - 1; i += 1) {
        const [x1, y1] = points[i]!;
        const [x2, y2] = points[i + 1]!;
        for (let step = 0; step <= 40; step += 1) {
          const t = step / 40;
          const x = x1 + (x2 - x1) * t;
          const y = y1 + (y2 - y1) * t;
          if (boxes.some((b) => x > b.left && x < b.right && y > b.top && y < b.bottom)) {
            collisions.push(`${edge.d} at (${Math.round(x)},${Math.round(y)})`);
          }
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  it('gives each elbow edge its own vertical lane so they never overlap', () => {
    drive([]);
    // An elbow is a 4-point path: leave sideways, run down a lane, come back in.
    // coach->finalize, human_review->finalize and the revise->coach loop are
    // elbows; sharing a lane would draw their vertical runs on top of each other.
    const lanes = component
      .edgeViews()
      .map((edge) => pointsOf(edge.d))
      .filter((points) => points.length === 4)
      .map((points) => points[1]![0]);

    expect(lanes.length).toBe(3);
    expect(new Set(lanes).size).toBe(3);
  });

  it('shows a node that never closed as failed once the build errors', () => {
    const open = foldTrace([
      { type: 'node_start', data: { node: 'draft_resume', round: 1, at: 1_000 } },
    ]);
    drive(open);
    expect(component.nodeViews().find((n) => n.label === 'Draft')!.cls).toContain('running');

    drive(open, { errored: true });
    expect(component.nodeViews().find((n) => n.label === 'Draft')!.cls).toContain('failed');
    expect(component.traceRows()[0]!.detail).toBe('stopped here');
    expect(component.traceRows()[0]!.duration).toBe('—');
  });
});

function pointsOf(d: string): Array<[number, number]> {
  return d
    .split(/[ML]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+/).map(Number) as [number, number]);
}
