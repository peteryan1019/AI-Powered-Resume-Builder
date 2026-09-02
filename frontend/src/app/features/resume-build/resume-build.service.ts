import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ResumeBuildStep {
  state: 'queued' | 'generating' | 'checking' | 'revising' | 'generating_pdf' | 'done';
  label: string;
  step: number;
  total: number;
}

export interface CoachCriterion {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  explanation: string;
}

export interface CoachRecommendation {
  id: string;
  title: string;
  rationale: string;
  proposedChange: string;
  requiresUserInput: boolean;
  candidateSourceIds: string[];
}

export interface CoachReview {
  reviewId: string;
  round: number;
  overallScore: number;
  passes: boolean;
  summary: string;
  criteria: CoachCriterion[];
  recommendations: CoachRecommendation[];
}

export interface RecommendationDecision {
  recommendationId: string;
  decision: 'accept' | 'reject';
  /** Guidance when accepted, the user's reason when rejected. */
  specification?: string;
}

/**
 * Something the profile agent noticed in what you wrote: either an entry your
 * profile does not have, or a fact about one it does have that was never
 * written down.
 */
export interface ProfileProposal {
  mode: 'create' | 'update';
  sectionType: string;
  /** For an update, which existing entry it changes. */
  sourceId?: string;
  /** For an update, that entry's data as it stands, to open the form on. */
  current?: Record<string, unknown>;
  /** A short phrase naming it, e.g. "a project called Ledger API". */
  label: string;
  /** Your own words that prompted it, so you can judge the suggestion. */
  quote: string;
  /** For a create, the new entry's fields. For an update, only what changes. */
  fields: Record<string, string | boolean>;
  /** Fields you did not mention, which the form should ask you for. */
  missing: string[];
}

/** A proposal you confirmed and completed in the profile form. */
export interface ProfileChangeInput {
  mode: 'create' | 'update';
  sectionType: string;
  sourceId?: string;
  label: string;
  data: Record<string, unknown>;
}

export interface ResumeBuildComplete {
  pdfUrl: string;
}

/** Node ids as declared by `.addNode(...)` in the backend's graph.ts. */
export type WorkflowNodeName =
  | 'draft_resume'
  | 'coach'
  | 'publish_review'
  | 'human_review'
  | 'revise'
  | 'finalize';

export interface WorkflowTopologyEdge {
  source: string;
  target: string;
  /** True for edges produced by addConditionalEdges, i.e. a branch. */
  conditional: boolean;
}

/** The graph's real shape, generated from the compiled LangGraph on the server. */
export interface WorkflowTopology {
  nodes: string[];
  edges: WorkflowTopologyEdge[];
}

/** A node entering the run. The order of these IS the path actually taken. */
export interface NodeStartEvent {
  node: WorkflowNodeName;
  round: number;
  at: number;
}

/** A node leaving the run, with whatever that node measured on the way out. */
export interface NodeEndEvent {
  node: WorkflowNodeName;
  round: number;
  at: number;
  durationMs?: number;
  score?: number;
  passes?: boolean;
  threshold?: number;
  maxRounds?: number;
  recommendations?: number;
  accepted?: number;
  reusedExisting?: boolean;
}

/** One visit to one node. A node is visited again on every revision round. */
export interface NodeVisit {
  node: WorkflowNodeName;
  round: number;
  startedAt: number;
  endedAt: number | null;
  detail: NodeEndEvent | null;
}

/** A raw trace event, either live over SSE or replayed from the trace endpoint. */
export interface RunTraceEvent {
  type: 'node_start' | 'node_end';
  data: NodeStartEvent | NodeEndEvent;
}

/**
 * Folds the raw event log into the list of node visits the UI draws.
 *
 * A node_end closes the most recent still-OPEN visit to that node rather than
 * simply the last one with that name: coach, human_review and revise each run
 * again on every revision round, so the same node appears several times and
 * closing the wrong one would mis-time every stage after it.
 */
export function foldTrace(events: RunTraceEvent[]): NodeVisit[] {
  const visits: NodeVisit[] = [];
  for (const event of events) {
    if (event.type === 'node_start') {
      const data = event.data as NodeStartEvent;
      visits.push({
        node: data.node,
        round: data.round,
        startedAt: data.at,
        endedAt: null,
        detail: null,
      });
      continue;
    }
    const data = event.data as NodeEndEvent;
    for (let index = visits.length - 1; index >= 0; index -= 1) {
      const visit = visits[index]!;
      if (visit.node === data.node && visit.endedAt === null) {
        visits[index] = { ...visit, endedAt: data.at, detail: data };
        break;
      }
    }
  }
  return visits;
}

@Injectable({ providedIn: 'root' })
export class ResumeBuildService {
  private readonly http = inject(HttpClient);

  // Absolute base (matching ResumeService). The build stream is opened with an
  // EventSource, which is same-origin unless it hits the backend directly; using
  // the absolute origin + withCredentials ensures the backend session cookie is
  // sent (the global CORS config allows localhost:4200 with credentials).
  private readonly apiUrl = '/api';

  /** Registers a build job from a posting URL and returns its jobId. */
  startBuild(userId: string, url: string, templateId: string): Observable<{ jobId: string }> {
    return this.registerBuild(userId, { URL: url, templateId });
  }

  /**
   * Registers a build job from a pasted job description. Used after a URL build
   * stopped with `job_post_unreadable` — the AI could not see the posting, so
   * the user supplies its text instead.
   */
  startBuildFromDescription(
    userId: string,
    jobDescription: string,
    templateId: string,
  ): Observable<{ jobId: string }> {
    return this.registerBuild(userId, { jobDescription, templateId });
  }

  private registerBuild(
    userId: string,
    body: { templateId: string; URL?: string; jobDescription?: string },
  ): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(`${this.apiUrl}/users/${userId}/resumes`, body, {
      withCredentials: true,
    });
  }

  retryBuild(userId: string, jobId: string): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(
      `${this.apiUrl}/users/${userId}/resumes/${jobId}/retry`,
      {},
      { withCredentials: true },
    );
  }

  eventsUrl(userId: string, jobId: string, afterEventId?: string): string {
    const base = `${this.apiUrl}/users/${userId}/resumes/${jobId}/events`;
    return afterEventId ? `${base}?after=${encodeURIComponent(afterEventId)}` : base;
  }

  /** The workflow's node/edge topology, for drawing the diagram. */
  getWorkflowGraph(userId: string): Observable<WorkflowTopology> {
    return this.http.get<WorkflowTopology>(
      `${this.apiUrl}/users/${userId}/resumes/workflow-graph`,
      { withCredentials: true },
    );
  }

  /**
   * The run trace for a finished resume, replayed from its build's Redis event
   * stream. `buildId` is null for resumes created before the workflow existed,
   * and `events` is empty once the stream has expired.
   */
  getRunTrace(
    userId: string,
    resumeId: string,
  ): Observable<{ buildId: string | null; events: RunTraceEvent[] }> {
    return this.http.get<{ buildId: string | null; events: RunTraceEvent[] }>(
      `${this.apiUrl}/users/${userId}/resumes/${resumeId}/trace`,
      { withCredentials: true },
    );
  }

  /**
   * Asks the profile agent to read what you typed and notice anything you
   * described that your profile does not list. It only proposes; nothing is
   * written until you confirm it in the profile form.
   */
  getProfileProposals(
    userId: string,
    jobId: string,
    notes: Array<{ about: string; text: string }>,
  ): Observable<{ changes: ProfileProposal[] }> {
    return this.http.post<{ changes: ProfileProposal[] }>(
      `${this.apiUrl}/users/${userId}/resumes/${jobId}/profile-proposals`,
      { notes },
      { withCredentials: true },
    );
  }

  getReview(userId: string, jobId: string): Observable<{ review: CoachReview }> {
    return this.http.get<{ review: CoachReview }>(
      `${this.apiUrl}/users/${userId}/resumes/${jobId}/review`,
      { withCredentials: true },
    );
  }

  submitDecisions(
    userId: string,
    jobId: string,
    reviewId: string,
    decisions: RecommendationDecision[],
    nextStep: 'revise' | 'finalize',
    extras: { note?: string; profileChanges?: ProfileChangeInput[] } = {},
  ): Observable<{ buildId: string; status: string }> {
    return this.http.post<{ buildId: string; status: string }>(
      `${this.apiUrl}/users/${userId}/resumes/${jobId}/decisions`,
      { reviewId, decisions, nextStep, ...extras },
      { withCredentials: true },
    );
  }

  /**
   * The in-flight draft rendered to PDF. Only meaningful while a build is
   * paused at human_review; the server renders it on demand from the LangGraph
   * checkpoint, so there is no draft to fetch before the first draft node runs.
   */
  draftPdfUrl(userId: string, buildId: string): string {
    return `${this.apiUrl}/users/${userId}/resumes/${buildId}/draft.pdf`;
  }

  pdfUrl(userId: string, resumeId: string): string {
    return `${this.apiUrl}/users/${userId}/resumes/${resumeId}/pdf`;
  }
}
