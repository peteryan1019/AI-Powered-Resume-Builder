import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { NodeVisit, WorkflowTopology } from './resume-build.service';

interface NodeView {
  cls: string;
  label: string;
  meta: string;
  x: number;
  boxX: number;
  boxY: number;
  width: number;
  height: number;
  radius: number;
  labelY: number;
  metaY: number;
}

interface EdgeView {
  cls: string;
  d: string;
  marker: string;
}

interface TraceRow {
  cls: string;
  index: number;
  label: string;
  round: string;
  duration: string;
  detail: string;
}

/**
 * The workflow diagram and the run timeline. Shown live on the build status
 * page while a resume is being built, and again on the result page beside the
 * finished PDF — a fast build otherwise leaves no time to read any of it.
 */
@Component({
  selector: 'app-run-trace',
  standalone: true,
  imports: [CommonModule],
  template: `
          <div class="run">
            <div class="graph-wrap">
              <svg
                class="graph"
                *ngIf="nodeViews().length; else noGraph"
                [attr.viewBox]="'0 0 ' + graphWidth + ' ' + graphHeight"
                role="img"
                aria-label="Resume build workflow graph"
              >
                <defs>
                  <marker
                    id="ar-idle"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M0 0 L10 5 L0 10 z" fill="rgba(255,255,255,0.22)" />
                  </marker>
                  <marker
                    id="ar-taken"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M0 0 L10 5 L0 10 z" fill="#8b72ff" />
                  </marker>
                </defs>
                <path
                  *ngFor="let edge of edgeViews()"
                  [attr.d]="edge.d"
                  [attr.class]="edge.cls"
                  [attr.marker-end]="edge.marker"
                />
                <g *ngFor="let node of nodeViews()" [attr.class]="node.cls">
                  <rect
                    [attr.x]="node.boxX"
                    [attr.y]="node.boxY"
                    [attr.width]="node.width"
                    [attr.height]="node.height"
                    [attr.rx]="node.radius"
                  />
                  <text [attr.x]="node.x" [attr.y]="node.labelY" text-anchor="middle">
                    {{ node.label }}
                  </text>
                  <text
                    *ngIf="node.meta"
                    class="gmeta"
                    [attr.x]="node.x"
                    [attr.y]="node.metaY"
                    text-anchor="middle"
                  >
                    {{ node.meta }}
                  </text>
                </g>
              </svg>
              <ng-template #noGraph>
                <p class="graph-missing">
                  {{ unavailable() ?? 'Loading the workflow graph…' }}
                </p>
              </ng-template>
              <p class="graph-missing" *ngIf="unlaidNodes().length">
                Not drawn (no layout for {{ unlaidNodes().join(', ') }}) — see the
                table for what ran.
              </p>
              <ul class="legend">
                <li><span class="sw done"></span>done</li>
                <li><span class="sw running"></span>running</li>
                <li><span class="sw failed"></span>failed</li>
                <li><span class="sw pending"></span>not taken</li>
                <li><span class="sw dashed"></span>branch</li>
              </ul>
            </div>

            <div class="trace">
              <p class="trace-head" *ngIf="visits().length; else noTrace">
                {{ visits().length }} step{{ visits().length === 1 ? '' : 's' }} ·
                {{ coachRounds() }} coach round{{ coachRounds() === 1 ? '' : 's' }} ·
                {{ totalElapsed() }} elapsed
              </p>
              <ng-template #noTrace>
                <p class="trace-head">No steps have run yet.</p>
              </ng-template>
              <table class="timeline" *ngIf="visits().length">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Stage</th>
                    <th>Round</th>
                    <th class="num">Took</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let row of traceRows()" [attr.class]="row.cls">
                    <td class="num">{{ row.index }}</td>
                    <td>{{ row.label }}</td>
                    <td class="num">{{ row.round }}</td>
                    <td class="num">{{ row.duration }}</td>
                    <td>{{ row.detail }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
  `,
  styles: [
    `
      .run {
        display: grid;
        grid-template-columns: minmax(280px, 360px) 1fr;
        gap: 2rem;
        align-items: start;
        margin: 2rem 0 1rem;
      }
      .graph {
        width: 100%;
        height: auto;
        overflow: visible;
      }
      .graph-missing {
        color: rgba(244, 246, 255, 0.45);
        font-size: 0.85rem;
      }
      .graph text {
        font-size: 12px;
        font-weight: 700;
        fill: rgba(244, 246, 255, 0.5);
      }
      .graph .gmeta {
        font-size: 10px;
        font-weight: 600;
        fill: rgba(244, 246, 255, 0.42);
      }
      .gnode rect {
        fill: rgba(255, 255, 255, 0.03);
        stroke: rgba(255, 255, 255, 0.16);
        stroke-width: 1.5;
      }
      .gnode.terminal rect {
        fill: rgba(255, 255, 255, 0.06);
        stroke: rgba(255, 255, 255, 0.12);
      }
      .gnode.done rect {
        fill: rgba(122, 97, 255, 0.18);
        stroke: #7a61ff;
      }
      .gnode.done text {
        fill: #ded8ff;
      }
      .gnode.running rect {
        fill: rgba(122, 97, 255, 0.28);
        stroke: #8b72ff;
        stroke-width: 2.5;
      }
      .gnode.running text {
        fill: #fff;
      }
      .gnode.failed rect {
        fill: rgba(255, 96, 116, 0.18);
        stroke: #ff6074;
        stroke-width: 2.5;
      }
      .gnode.failed text {
        fill: #ffd9de;
      }
      .edge {
        fill: none;
        stroke: rgba(255, 255, 255, 0.16);
        stroke-width: 1.6;
      }
      .edge.conditional {
        stroke-dasharray: 5 4;
      }
      .edge.taken {
        stroke: #8b72ff;
        stroke-width: 2.4;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin: 0.9rem 0 0;
        padding: 0;
        list-style: none;
        font-size: 0.7rem;
        color: rgba(244, 246, 255, 0.45);
      }
      .legend li {
        display: flex;
        align-items: center;
        gap: 0.3rem;
      }
      .sw {
        width: 0.85rem;
        height: 0.6rem;
        border-radius: 3px;
        border: 1.5px solid rgba(255, 255, 255, 0.16);
      }
      .sw.done {
        background: rgba(122, 97, 255, 0.18);
        border-color: #7a61ff;
      }
      .sw.running {
        background: rgba(122, 97, 255, 0.28);
        border-color: #8b72ff;
      }
      .sw.failed {
        background: rgba(255, 96, 116, 0.18);
        border-color: #ff6074;
      }
      .sw.dashed {
        border-style: dashed;
        background: none;
      }
      .trace-head {
        margin: 0 0 0.6rem;
        font-size: 0.78rem;
        font-weight: 700;
        color: rgba(244, 246, 255, 0.5);
      }
      .timeline {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8rem;
      }
      .timeline th {
        text-align: left;
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: rgba(244, 246, 255, 0.35);
        padding: 0 0.6rem 0.4rem 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .timeline td {
        padding: 0.45rem 0.6rem 0.45rem 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        color: rgba(244, 246, 255, 0.72);
        vertical-align: top;
      }
      .timeline .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .timeline tr.running td {
        color: #fff;
      }
      .timeline tr.failed td {
        color: #ffd9de;
      }
      @media (max-width: 650px) {
        .run {
          grid-template-columns: 1fr;
          gap: 1.5rem;
        }
        .timeline {
          font-size: 0.74rem;
        }
      }
    `,
  ],
})
export class RunTraceComponent {
  /** The graph's real shape, generated from the backend's compiled LangGraph. */
  readonly topology = input<WorkflowTopology | null>(null);
  /** Every node visit this build made, in the order they happened. */
  readonly visits = input<NodeVisit[]>([]);
  /** True once the build has stopped with an error. */
  readonly errored = input(false);
  /** True once the build reached the end of the graph. */
  readonly completed = input(false);
  /** Message to show in place of the diagram when the topology could not load. */
  readonly unavailable = input<string | null>(null);

  readonly graphWidth = 400;
  readonly graphHeight = 520;
  private readonly NODE_W = 132;
  private readonly NODE_H = 40;
  private readonly TERMINAL_W = 72;
  private readonly TERMINAL_H = 26;
  /** First vertical lane in the gap between the two node columns, and the gap
   *  between consecutive lanes. Both sit clear of every node box. */
  private readonly GUTTER_X = 196;
  private readonly GUTTER_STEP = 14;

  private readonly NODE_LABELS: Record<string, string> = {
    __start__: 'Start',
    draft_resume: 'Draft',
    coach: 'Coach review',
    publish_review: 'Publish review',
    human_review: 'Your feedback',
    revise: 'Revise',
    finalize: 'Finalize + PDF',
    __end__: 'Done',
  };

  /**
   * Where each node sits in the diagram. The topology itself (which nodes exist
   * and how they are wired) comes from the server so it cannot drift; only this
   * hand-placed geometry lives here. A node the server reports that has no entry
   * below is listed under the diagram rather than silently dropped.
   */
  private readonly LAYOUT: Record<string, { x: number; y: number }> = {
    __start__: { x: 120, y: 26 },
    draft_resume: { x: 120, y: 96 },
    coach: { x: 120, y: 176 },
    publish_review: { x: 120, y: 256 },
    human_review: { x: 120, y: 336 },
    revise: { x: 120, y: 416 },
    finalize: { x: 300, y: 416 },
    __end__: { x: 300, y: 486 },
  };

  readonly unlaidNodes = computed(() =>
    (this.topology()?.nodes ?? []).filter((id) => !this.LAYOUT[id]),
  );

  readonly coachRounds = computed(
    () => this.visits().filter((visit) => visit.node === 'coach').length,
  );

  readonly totalElapsed = computed(() => {
    const visits = this.visits();
    if (!visits.length) return '0s';
    const first = visits[0]!.startedAt;
    const last = visits.reduce(
      (latest, visit) => Math.max(latest, visit.endedAt ?? visit.startedAt),
      first,
    );
    return this.formatMs(Math.max(0, last - first));
  });

  readonly nodeViews = computed<NodeView[]>(() => {
    const topology = this.topology();
    if (!topology) return [];
    return topology.nodes
      .filter((id) => this.LAYOUT[id])
      .map((id) => {
        const position = this.LAYOUT[id]!;
        const terminal = id === '__start__' || id === '__end__';
        const width = terminal ? this.TERMINAL_W : this.NODE_W;
        const height = terminal ? this.TERMINAL_H : this.NODE_H;
        const status = terminal ? this.terminalStatus(id) : this.statusOf(id);
        const meta = terminal ? '' : this.nodeMeta(id);
        return {
          cls: `gnode ${status}${terminal ? ' terminal' : ''}`,
          label: this.NODE_LABELS[id] ?? id,
          meta,
          x: position.x,
          boxX: position.x - width / 2,
          boxY: position.y - height / 2,
          width,
          height,
          radius: terminal ? height / 2 : 10,
          labelY: meta ? position.y - 1 : position.y + 4,
          metaY: position.y + 12,
        };
      });
  });

  readonly edgeViews = computed<EdgeView[]>(() => {
    const topology = this.topology();
    if (!topology) return [];
    const taken = this.takenEdges();
    const drawable = topology.edges.filter(
      (edge) => this.LAYOUT[edge.source] && this.LAYOUT[edge.target],
    );
    // Every edge that changes column runs down its own vertical lane in the gap
    // between the two columns, so two such edges never sit on top of each other.
    const lanes = new Map<string, number>();
    drawable
      .filter((edge) => this.LAYOUT[edge.source]!.x !== this.LAYOUT[edge.target]!.x)
      .forEach((edge, index) =>
        lanes.set(
          `${edge.source}->${edge.target}`,
          this.GUTTER_X + index * this.GUTTER_STEP,
        ),
      );
    return drawable.map((edge) => {
      const key = `${edge.source}->${edge.target}`;
      const isTaken = taken.has(key);
      return {
        cls:
          'edge' +
          (edge.conditional ? ' conditional' : '') +
          (isTaken ? ' taken' : ''),
        d: this.edgePath(edge.source, edge.target, lanes.get(key) ?? this.GUTTER_X),
        marker: isTaken ? 'url(#ar-taken)' : 'url(#ar-idle)',
      };
    });
  });

  readonly traceRows = computed<TraceRow[]>(() =>
    this.visits().map((visit, index) => {
      const elapsed = this.durationMs(visit);
      const open = visit.endedAt === null;
      return {
        cls: open ? (this.errored() ? 'failed' : 'running') : '',
        index: index + 1,
        label: this.NODE_LABELS[visit.node] ?? visit.node,
        round: String(visit.round),
        duration:
          elapsed === null
            ? this.errored()
              ? '—'
              : '…'
            : this.formatMs(elapsed),
        detail: this.visitDetail(visit),
      };
    }),
  );

  private visitsOf(node: string): NodeVisit[] {
    return this.visits().filter((visit) => visit.node === node);
  }

  /** A node with an unclosed visit is still running — unless the build died. */
  private statusOf(node: string): 'pending' | 'running' | 'done' | 'failed' {
    const visits = this.visitsOf(node);
    if (!visits.length) return 'pending';
    if (visits.some((visit) => visit.endedAt === null)) {
      return this.errored() ? 'failed' : 'running';
    }
    return 'done';
  }

  private terminalStatus(id: string): 'pending' | 'done' {
    if (id === '__start__') return this.visits().length ? 'done' : 'pending';
    return this.completed() ? 'done' : 'pending';
  }

  private nodeMeta(id: string): string {
    const visits = this.visitsOf(id);
    const last = visits[visits.length - 1];
    if (!last) return '';
    if (last.endedAt === null) return this.errored() ? 'failed' : 'running…';
    const elapsed = this.durationMs(last);
    const shown = elapsed === null ? '' : this.formatMs(elapsed);
    if (id === 'coach' && last.detail?.score !== undefined) {
      return `${last.detail.score}${last.detail.passes ? ' ✓' : ' ✗'} · ${shown}`;
    }
    return visits.length > 1 ? `${shown} · ×${visits.length}` : shown;
  }

  private visitDetail(visit: NodeVisit): string {
    const detail = visit.detail;
    if (!detail) {
      return visit.endedAt === null && this.errored() ? 'stopped here' : '';
    }
    if (visit.node === 'coach' && detail.score !== undefined) {
      const verdict = detail.passes
        ? `passes the bar of over ${detail.threshold}`
        : `under the bar of ${detail.threshold}`;
      const raised = detail.recommendations
        ? `, raised ${detail.recommendations} recommendation${detail.recommendations === 1 ? '' : 's'}`
        : '';
      return `Scored ${detail.score} — ${verdict}${raised}`;
    }
    if (visit.node === 'human_review' && detail.accepted !== undefined) {
      return `You accepted ${detail.accepted} recommendation${detail.accepted === 1 ? '' : 's'}`;
    }
    if (visit.node === 'revise' && detail.accepted !== undefined) {
      return `Applied ${detail.accepted} change${detail.accepted === 1 ? '' : 's'}`;
    }
    if (visit.node === 'finalize') {
      return detail.reusedExisting ? 'Reused the existing PDF' : 'Rendered the PDF';
    }
    return '';
  }

  /** Consecutive pairs in the visit order are exactly the edges that were taken. */
  private takenEdges(): Set<string> {
    const path = ['__start__', ...this.visits().map((visit) => visit.node)];
    if (this.completed()) path.push('__end__');
    const taken = new Set<string>();
    for (let index = 0; index < path.length - 1; index += 1) {
      taken.add(`${path[index]}->${path[index + 1]}`);
    }
    return taken;
  }

  private halfHeight(id: string): number {
    const terminal = id === '__start__' || id === '__end__';
    return (terminal ? this.TERMINAL_H : this.NODE_H) / 2;
  }

  private halfWidth(id: string): number {
    const terminal = id === '__start__' || id === '__end__';
    return (terminal ? this.TERMINAL_W : this.NODE_W) / 2;
  }

  private edgePath(sourceId: string, targetId: string, lane: number): string {
    const a = this.LAYOUT[sourceId]!;
    const b = this.LAYOUT[targetId]!;

    if (a.x === b.x) {
      if (b.y > a.y) {
        // Straight down the column to the node directly below.
        return (
          `M ${a.x} ${a.y + this.halfHeight(sourceId)} ` +
          `L ${b.x} ${b.y - this.halfHeight(targetId)}`
        );
      }
      // Upward in the same column: the revise -> coach revision loop. Route it
      // around the left margin so it reads as a loop, not a downward branch.
      const back = a.x - this.halfWidth(sourceId) - 26;
      return (
        `M ${a.x - this.halfWidth(sourceId)} ${a.y} L ${back} ${a.y} ` +
        `L ${back} ${b.y} L ${b.x - this.halfWidth(targetId)} ${b.y}`
      );
    }

    // Changing column: leave sideways, drop down this edge's own gutter lane,
    // then enter the target from its side. A direct curve would cut straight
    // through whatever nodes are stacked between the two rows.
    const rightward = b.x > a.x;
    const exit = a.x + (rightward ? 1 : -1) * this.halfWidth(sourceId);
    const entry = b.x - (rightward ? 1 : -1) * this.halfWidth(targetId);
    return `M ${exit} ${a.y} L ${lane} ${a.y} L ${lane} ${b.y} L ${entry} ${b.y}`;
  }

  private durationMs(visit: NodeVisit): number | null {
    if (visit.detail?.durationMs !== undefined) return visit.detail.durationMs;
    if (visit.endedAt !== null) return visit.endedAt - visit.startedAt;
    return null;
  }

  private formatMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
}
