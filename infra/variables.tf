variable "aws_region" {
  description = "AWS region. Keep this aligned with the region selected in the AWS console and CLI."
  type        = string
  default     = "us-east-2"
}

variable "environment" {
  description = "Tag used to distinguish this deployment from future staging or test stacks."
  type        = string
  default     = "production"
}

variable "cluster_name" {
  description = "Name of the EKS cluster and prefix for related resources."
  type        = string
  default     = "resumebuilder"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version. 1.35 remains in standard support until March 2027."
  type        = string
  default     = "1.35"
}

variable "domain_name" {
  description = "Public apex domain. Terraform requests its ACM TLS certificate but does not control Name.com DNS."
  type        = string
  default     = "resume-builder.dev"
}

variable "vpc_cidr" {
  description = "Private IPv4 range for the dedicated VPC."
  type        = string
  default     = "10.42.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "vpc_cidr must be a valid IPv4 CIDR."
  }
}

variable "cluster_public_access_cidrs" {
  description = <<-DESC
    IPv4 ranges allowed to reach the public Kubernetes API endpoint. GitHub-hosted
    runners do not have a small stable IP range, so the initial value permits the
    internet. Authentication and authorization are still mandatory. Restrict this
    later if CI moves to a runner with a fixed egress IP.
  DESC
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "node_instance_types" {
  description = "EC2 types allowed for the managed node group. amd64 is required by the current GHCR images."
  type        = list(string)
  default     = ["t3a.medium"]

  validation {
    condition     = length(var.node_instance_types) > 0
    error_message = "At least one node instance type is required."
  }
}

variable "node_min_size" {
  description = "Minimum number of worker nodes. One keeps the site and data services running."
  type        = number
  default     = 1
}

variable "node_desired_size" {
  description = "Initial worker-node count."
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "Maximum worker-node count. Two t3a.medium nodes fit the account's current five-vCPU quota."
  type        = number
  default     = 2
}

variable "node_volume_size_gib" {
  description = "Encrypted gp3 root disk size for each worker node. Application data uses separate PVCs."
  type        = number
  default     = 30

  validation {
    condition     = var.node_volume_size_gib >= 20
    error_message = "Use at least 20 GiB so container images and logs have safe headroom."
  }
}

variable "control_plane_log_retention_days" {
  description = "CloudWatch retention for EKS API, audit, and authentication logs."
  type        = number
  default     = 7
}

variable "addon_versions" {
  description = "Known-compatible EKS add-on versions for Kubernetes 1.35 in us-east-2."
  type        = map(string)
  default = {
    vpc-cni                = "v1.22.4-eksbuild.3"
    coredns                = "v1.13.2-eksbuild.31"
    kube-proxy             = "v1.35.3-eksbuild.29"
    eks-pod-identity-agent = "v1.3.10-eksbuild.3"
    aws-ebs-csi-driver     = "v1.66.0-eksbuild.1"
  }
}

variable "aws_load_balancer_controller_chart_version" {
  description = "Pinned Helm chart version for AWS Load Balancer Controller."
  type        = string
  default     = "3.5.0"
}

variable "cluster_autoscaler_chart_version" {
  description = "Pinned Helm chart version whose app version matches Kubernetes 1.35."
  type        = string
  default     = "9.59.0"
}

variable "keda_chart_version" {
  description = "Pinned Helm chart version for KEDA worker queue autoscaling."
  type        = string
  default     = "2.21.0"
}
