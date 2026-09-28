# Resume workflow

This folder is the service boundary for asynchronous resume generation.

- `queue.ts`: BullMQ producer contract. Queue payloads contain only stable IDs.
- `worker.ts`: independently deployable BullMQ consumer.
- `graph.ts`: LangGraph state machine and human-feedback interrupt.
- `redis.ts`: transient build metadata, review projections, and Redis Streams.
- `contracts.ts`: versioned data shared by the API, graph, and worker.

One `buildId` identifies the logical build and is also LangGraph's `thread_id`.
The initial and resume BullMQ jobs are separate execution attempts. A worker is
not occupied while the graph is waiting for the user's coach decisions.

Redis is the transient system of record. Checkpoints, review projections, input
snapshots, and the capped progress stream use a three-day TTL. The browser never
connects to Redis: it reads the authenticated SSE endpoint, which replays the
Redis Stream from the last event ID.

PostgreSQL is used only for durable effects. `Resume.buildId` and
`ProfileInstance.sourceBuildKey` are unique idempotency keys so a queue or HTTP
retry cannot duplicate a final resume or a user-approved new project.

## Process and orchestration contract

The backend image supports three separate workloads; sharing an image does not
put them in the same container or Pod:

- API: `node --import tsx src/start.ts`
- Resume worker: `node --import tsx src/resume-workflow/start-worker.ts`
- Database migration job: `npm run db:migrate:deploy`

The API never applies migrations during startup. Docker Compose runs the
one-shot `migrate` service before starting the API and worker; Kubernetes must
do the same with a Job before rolling out a new image.

The worker exposes process liveness at `GET /health` and dependency readiness
at `GET /health/ready` on `WORKER_HEALTH_PORT` (default `3001`). On SIGTERM it
becomes unready immediately, stops fetching BullMQ jobs, waits for active work,
then closes the LangGraph checkpointer, Redis clients, health server, and
Prisma. The orchestrator's termination grace period must be longer than the
longest expected resume build.
