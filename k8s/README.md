# Kubernetes deployment (Step 3)

This directory packages the application into two small Helm charts. Helm is a
package manager for Kubernetes: it turns the templates in these directories
into ordinary Kubernetes objects and remembers which objects belong to each
release.

## What runs

```text
Internet
   |
AWS Application Load Balancer
   |-- /api, /auth, /webhooks --> API Deployment (1 Pod)
   `-- everything else --------> frontend Deployment (1 Pod)

API --> PostgreSQL StatefulSet (1 Pod + EBS disk)
    --> Redis StatefulSet      (1 Pod + EBS disk)
    --> BullMQ waiting list
             |
             `--> resume-worker Deployment (KEDA scales only this)
```

The database components are one Helm release and the application components
are another. This separation is intentional:

1. PostgreSQL and Redis must already exist before a migration can run.
2. The application chart runs the Prisma migration as a Helm
   `pre-install,pre-upgrade` Job.
3. Helm only updates the API and worker after that Job succeeds.

This prevents several API replicas from racing to modify the schema during a
deployment.

## What Step 2 must provide first

Do not run these charts against AWS until the Terraform layer has created:

- the EKS cluster and EC2 worker-node group;
- the EBS CSI add-on and its IAM permissions (this creates EBS disks for PVCs);
- the AWS Load Balancer Controller and its IAM permissions;
- an ACM TLS certificate for the public hostname;
- at least two public subnets for EKS and the ALB, while the paid application
  nodes and EBS volumes may remain in one chosen availability zone;
- KEDA, installed in the cluster; and
- a `kubectl` context pointing at the correct cluster.

Two subnets do not mean two paid servers. EKS and an internet-facing ALB need
network presence in multiple availability zones, but the initial managed node
group can still run one EC2 node in one AZ. PostgreSQL and Redis consequently
remain single-AZ and will be unavailable if that node or AZ fails.

## Prepare secrets

Kubernetes Secrets are base64-encoded, not encrypted merely because they are
called Secrets. This chart deliberately does not place credentials in Helm
values or Git. For the first deployment, create the Secret directly from a
gitignored local file:

```bash
cp k8s/secrets.example.env k8s/secrets.env
# Edit k8s/secrets.env and replace every placeholder.
kubectl create namespace resumebuilder --dry-run=client -o yaml \
  | kubectl apply -f -
kubectl -n resumebuilder create secret generic resumebuilder-secrets \
  --from-env-file=k8s/secrets.env \
  --dry-run=client -o yaml | kubectl apply -f -
```

Generate URL-safe passwords so no percent-encoding is needed in connection
URLs, for example:

```bash
openssl rand -hex 32
```

`POSTGRES_PASSWORD` must match the password embedded in `DATABASE_URL`.
`REDIS_PASSWORD` must match the password embedded in `REDIS_URL`.

If the GHCR packages are private, also create an image-pull Secret using a
fine-grained or classic GitHub token that can only read packages:

```bash
kubectl -n resumebuilder create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_READ_PACKAGES_TOKEN
```

Then put `imagePullSecrets: [ghcr-pull]` in the production values file. Making
the packages public avoids keeping a GitHub token in the cluster.

## Install in the required order

Install the data release first and wait until both StatefulSets are healthy:

```bash
helm upgrade --install resumebuilder-data ./k8s/data \
  --namespace resumebuilder --create-namespace \
  --wait --timeout 10m
```

For a manual deployment, prepare application values:

```bash
cp k8s/app/values-production.example.yaml k8s/values-production.yaml
# Fill in the ACM certificate ARN, hostname, and immutable image tags.
```

Install the application. The migration Job runs first and blocks the rollout
if the schema cannot be updated:

```bash
helm upgrade --install resumebuilder-app ./k8s/app \
  --namespace resumebuilder \
  --values k8s/values-production.yaml \
  --atomic --wait --timeout 15m
```

Use immutable Git commit SHA tags. `latest` is convenient for humans but is not
a stable deployment identifier and makes rollbacks ambiguous.

## GitHub Actions deployment

`.github/workflows/release.yml` replaces the former SSH-to-a-VM jobs. After CI
passes, it builds both images from the same commit, pushes both the commit SHA
and `latest` tags to GHCR, obtains short-lived AWS credentials through GitHub
OIDC, and deploys the SHA tags with `k8s/app/values-aws.yaml`.

The AWS role is restricted twice: only this repository's `main` branch may
assume it, and its Kubernetes administrator access applies only to the
`resumebuilder` namespace.

The GHCR packages are private, so add these GitHub repository Actions secrets:

| Secret | Value |
|---|---|
| `GHCR_READ_USERNAME` | GitHub username that owns the token |
| `GHCR_READ_TOKEN` | classic PAT with only `read:packages` |

The workflow refreshes the `ghcr-pull` Kubernetes Secret from those values.
Do not use `GITHUB_TOKEN` as the persistent pull credential: it expires when
the Actions job ends, while Kubernetes must still pull images during later Pod
restarts and node replacements.

The first workflow run is deliberately safe. It publishes images, but skips
the Helm deployment until `resumebuilder-secrets` and the `postgres` and `redis`
StatefulSets exist. After completing the data installation above, run **Publish
and deploy to EKS** manually once from the repository's Actions page. Later
pushes to `main` that touch application or chart files deploy automatically.

## How worker scaling works

KEDA watches the Redis list `bull:resume-builds-v1:wait`, which is BullMQ's
list of immediately runnable resume jobs. The initial settings keep one worker
Pod running and target at most two waiting jobs per Pod, up to five Pods.
Scale-down is deliberately stabilized for ten minutes, and terminating workers
get up to fifteen minutes to finish in-flight AI calls. BullMQ removes a job
from the waiting list as soon as a worker claims it, so scaling down immediately
when that list becomes empty could otherwise interrupt the very work that made
the queue appear empty.

KEDA creates Pods; it does not create EC2 machines. If the existing EC2 node
does not have enough CPU or memory, the extra Pods remain `Pending` until a
node autoscaler adds capacity. Step 2 should therefore configure the managed
node group with minimum 1, desired 1, and a small maximum such as 3, and install
Cluster Autoscaler (or another compatible node autoscaler).

Each worker Pod processes two jobs concurrently by default. A five-Pod maximum
therefore means at most ten simultaneous AI workflows. Reduce either limit if
Gemini quotas or spending limits are lower.

## Verify a deployment

```bash
kubectl -n resumebuilder get pods,svc,ingress,pvc
kubectl -n resumebuilder get scaledobject,hpa
kubectl -n resumebuilder logs deployment/resumebuilder-api --tail=100
kubectl -n resumebuilder logs deployment/resumebuilder-worker --tail=100
kubectl -n resumebuilder describe ingress resumebuilder
```

The expected steady state is one PostgreSQL Pod, one Redis Pod, one API Pod,
one frontend Pod, and one or more worker Pods. The migration Job is deleted
after success and retained after failure so its logs can be inspected.

## Data safety

The EBS StorageClass and StatefulSets use `Retain`, so uninstalling a Helm
release does not intentionally erase the disks. This is protection against an
accidental uninstall, not a backup. EBS is tied to one availability zone, and
an application or operator mistake can still corrupt data. Add scheduled
PostgreSQL dumps to S3 and EBS snapshots before treating this as production.
