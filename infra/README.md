# AWS foundation for Resume Builder

This directory replaces the old single-EC2 deployment. Terraform creates the
AWS infrastructure that Kubernetes needs; the application itself remains in the
Helm charts under `../k8s` and is deployed in the next step.

Terraform does **not** run automatically. `terraform apply` creates paid AWS
resources, so inspect the saved plan before applying it.

## What the words mean

- **VPC**: your private network inside AWS.
- **Subnet**: one address range inside that network, located in one AWS
  availability zone. An availability zone is a physically separate data-center
  location within a region.
- **Internet Gateway**: the VPC's route to and from the public internet. AWS does
  not charge an hourly fee for it.
- **EKS**: AWS runs the Kubernetes control plane—the API and database that keep
  track of desired state. You pay AWS for this management layer.
- **Managed node group**: ordinary EC2 virtual machines registered as Kubernetes
  worker nodes. Your containers actually run on these machines.
- **Kubernetes add-on/controller**: a small system workload that gives Kubernetes
  an extra ability, such as creating EBS disks or AWS load balancers.
- **Pod Identity**: a secure bridge from one Kubernetes service account to one
  AWS IAM role. It avoids permanent AWS keys and prevents every pod on a node
  from sharing the node's permissions.
- **ACM**: AWS Certificate Manager. It issues the HTTPS certificate after you
  prove ownership by adding a CNAME record at Name.com.

## Resulting architecture

```text
AWS region: us-east-2

  Dedicated VPC (10.42.0.0/16)
  |
  +-- public subnet in AZ 1
  |   +-- one t3a.medium worker node initially
  |   +-- optional second node when pending pods need capacity
  |   +-- Postgres and Redis PVCs later use EBS in this same AZ
  |
  +-- public subnet in AZ 2
      +-- required for the EKS control plane and public load balancer
      +-- no worker node placed here by this configuration

  AWS-managed EKS control plane spans AWS infrastructure outside your nodes
  Application Load Balancer is created later by the k8s/app Ingress
```

The two public subnets route directly through an Internet Gateway. Nodes receive
public IPv4 addresses, but Kubernetes application services are not exposed
directly from those nodes. This is what removes the NAT Gateway bill while still
allowing containers to pull GHCR images and call Gemini, Stripe, and Resend.

This is a cost-first, single-AZ workload design, not a highly available design.
If AZ 1 fails, or its only node fails before Kubernetes replaces it, the site,
Postgres, and Redis are temporarily unavailable. A later production-hardening
step can distribute nodes and replicated data across zones, at additional cost.

## Resources created

Terraform creates:

1. A dedicated VPC, two public subnets, one route table, and one Internet
   Gateway. It creates no NAT Gateway.
2. An EKS 1.35 cluster with API, audit, and authenticator logs retained for
   seven days.
3. One managed worker node initially, with autoscaling allowed from one to two
   `t3a.medium` nodes in the first AZ. Root disks are encrypted 30-GiB gp3.
4. AWS-managed Kubernetes networking, DNS, proxy, Pod Identity, and EBS storage
   add-ons, pinned to versions compatible with EKS 1.35.
5. AWS Load Balancer Controller, Cluster Autoscaler, and KEDA, installed with
   pinned Helm chart versions.
6. Narrow IAM roles for the cluster, nodes, storage/network add-ons, load
   balancer controller, and cluster autoscaler.
7. A GitHub OIDC provider and main-branch deployment role. Its EKS access is
   limited to administrator operations inside the `resumebuilder` namespace.
8. A free public ACM certificate request for `resume-builder.dev`. You still
   have to add its validation CNAME at Name.com.

It does **not** create Postgres, Redis, API, frontend, resume worker, application
secrets, an Application Load Balancer, or DNS records. Those appear only when
the `k8s/data` and `k8s/app` charts are deployed.

## Important cost boundary

The major monthly charges begin as soon as you apply:

- EKS control plane: roughly $0.10/hour, about $73/month.
- One `t3a.medium` EC2 worker plus its public IPv4 address and 30-GiB root disk.
- A small CloudWatch Logs charge based on control-plane log volume.
- EBS data volumes after the data chart is deployed.
- An Application Load Balancer after the app chart creates its Ingress.
- Internet data transfer beyond AWS's allowances.

There is no NAT Gateway, RDS, ElastiCache, Route 53 hosted zone, or second
always-on worker in this foundation. Check the current AWS Pricing Calculator
before applying; prices change and taxes vary.

## Prerequisites

Install these command-line programs:

- Terraform
- AWS CLI v2
- `kubectl`
- Helm

Your current machine already has Terraform, AWS CLI, and Helm. Verify AWS login
and the selected account without changing anything:

```bash
aws sts get-caller-identity
aws configure get region
```

The expected region is `us-east-2`. The account ID printed here must be the
account where you intend to incur the charges.

## Configure and review

From the repository root:

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
terraform init -upgrade
terraform fmt -check
terraform validate
terraform plan -out=resumebuilder.tfplan
terraform show resumebuilder.tfplan
```

The example values are ready for the agreed first deployment. You do not need
to put passwords, API keys, database credentials, or GitHub tokens in this
Terraform configuration.

Read the final plan summary carefully. It should add resources but should not
destroy or replace unrelated AWS resources. The plan file can contain sensitive
infrastructure values and is ignored by Git.

## Create the foundation

Only run this after accepting the plan and its ongoing cost:

```bash
terraform apply resumebuilder.tfplan
```

Expect EKS and the node group to take roughly 15–25 minutes. The Helm controllers
are installed only after the cluster and node are ready.

If an `aws login` session expires, run `aws login` again and repeat the failed
Terraform command. Terraform records successfully created resources in state,
so a normal retry continues rather than creating duplicates.

## Validate the domain certificate

After apply, ask Terraform for the required DNS record:

```bash
terraform output -json certificate_dns_validation_records
```

At Name.com, add each record exactly as shown:

- Type: `CNAME`
- Host/name: the `name` value
- Answer/value: the `value` value
- TTL: the default or 300 seconds

Some DNS dashboards automatically append the domain. If Name.com displays the
final host as `_token.resume-builder.dev`, do not append the domain a second
time. Keep this validation record permanently; ACM uses it for automatic
renewal.

Check issuance with:

```bash
aws acm describe-certificate \
  --region us-east-2 \
  --certificate-arn "$(terraform output -raw certificate_arn)" \
  --query 'Certificate.Status' \
  --output text
```

It changes from `PENDING_VALIDATION` to `ISSUED` after DNS propagates.

## Connect kubectl and verify

```bash
aws eks update-kubeconfig --region us-east-2 --name resumebuilder
kubectl get nodes -o wide
kubectl get pods -A
helm list -A
```

The first command writes a cluster entry to your local Kubernetes configuration.
It does not create another server. The remaining commands should show one Ready
node and healthy system/controller pods.

Expected Helm releases:

- `aws-load-balancer-controller` in `kube-system`
- `cluster-autoscaler` in `kube-system`
- `keda` in `keda`

At that point this infrastructure step is complete. Continue with `../k8s/README.md`
to create application secrets, deploy self-hosted Postgres and Redis, run the
database migration, and deploy the API/frontend/resume worker.

## Terraform state

The initial deployment keeps `terraform.tfstate` locally to avoid extra setup.
That file is the ownership map connecting Terraform resources to real AWS
resources. It is ignored by Git and must be backed up to encrypted storage after
every apply.

Do not let two people apply from different copies. Before moving infrastructure
CI into GitHub Actions, migrate state to a versioned, encrypted S3 backend with
state locking; otherwise simultaneous applies or a lost laptop can corrupt or
lose that ownership map.

## Safe teardown warning

`terraform destroy` removes the EKS cluster and worker infrastructure. Once the
data chart has created Postgres EBS volumes, destroying infrastructure can make
those volumes inaccessible or lead to data loss. Export a verified database
backup before any teardown. Never treat a Terraform destroy/recreate cycle as a
normal deployment method for this application.
